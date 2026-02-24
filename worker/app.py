"""
============================================================
FILE: worker/app.py
============================================================
Render.com Worker — AI Shorts Generator Pipeline

Endpoints:
  POST /shorts  — Full pipeline: download → transcribe → detect → clip → caption → upload
  POST /dub     — (Existing) Video dubbing pipeline
  GET  /health  — Health check

Pipeline Steps:
  1. Download YouTube video via yt-dlp
  2. Extract audio + transcribe via OpenAI Whisper API
  3. GPT-4o analyzes transcript → finds viral moments + scores them
  4. FFmpeg extracts each clip + crops to 9:16 (face-track/center/dynamic)
  5. FFmpeg burns captions (karaoke/block/centered)
  6. Generate thumbnail per clip (optional)
  7. GPT-4o generates title + description per clip
  8. Upload clips + thumbnails to Supabase Storage
  9. Update shorts_projects row with clips JSONB + status=done

ENV VARS REQUIRED:
  SUPABASE_URL          — e.g. https://xxx.supabase.co
  SUPABASE_SERVICE_KEY  — service_role key
  OPENAI_API_KEY        — for Whisper + GPT-4o
============================================================
"""

import os
import sys
import json
import uuid
import math
import subprocess
import tempfile
import traceback
from pathlib import Path

from flask import Flask, request, jsonify
from dotenv import load_dotenv

load_dotenv()

# ── Supabase client (lazy init) ──────────────────────────
from supabase import create_client as _create_sb_client
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

_sb_client = None

def get_sb():
    """Lazy-init Supabase client on first use."""
    global _sb_client
    if _sb_client is None:
        url = SUPABASE_URL
        key = SUPABASE_KEY
        if not url or not key:
            raise RuntimeError(
                f"Missing Supabase config. SUPABASE_URL={'set' if url else 'EMPTY'}, "
                f"SUPABASE_SERVICE_KEY={'set' if key else 'EMPTY'}. "
                f"Check Render env vars."
            )
        print(f"[init] Supabase URL: {url[:30]}...", file=sys.stderr)
        print(f"[init] Supabase KEY: {key[:20]}... (len={len(key)})", file=sys.stderr)
        _sb_client = _create_sb_client(url, key)
    return _sb_client

# ── OpenAI client ────────────────────────────────────────
from openai import OpenAI
openai = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

# ── Flask app ────────────────────────────────────────────
app = Flask(__name__)

# ── Temp directory ───────────────────────────────────────
WORK_DIR = Path(tempfile.gettempdir()) / "shorts_worker"
WORK_DIR.mkdir(exist_ok=True)


# ═══════════════════════════════════════════════════════════
# HELPER: Update project progress in Supabase
# ═══════════════════════════════════════════════════════════
def update_progress(project_id: str, pct: int, stage: str, clips=None, error=None):
    """Update the shorts_projects row with current progress."""
    data = {
        "progress_pct": pct,
        "progress_stage": stage,
    }
    if clips is not None:
        data["clips"] = clips
    if error:
        data["status"] = "error"
        data["error_message"] = error
    try:
        get_sb().table("shorts_projects").update(data).eq("id", project_id).execute()
    except Exception as e:
        print(f"[update_progress] Error: {e}", file=sys.stderr)


# ═══════════════════════════════════════════════════════════
# STEP 1: Download YouTube video via yt-dlp
# ═══════════════════════════════════════════════════════════
def download_video(source_url: str, project_id: str) -> dict:
    """Download video + audio. Returns paths dict."""
    print(f"[Step 1] Downloading: {source_url}")

    out_dir = WORK_DIR / project_id
    out_dir.mkdir(exist_ok=True)

    video_path = str(out_dir / "source.mp4")
    audio_path = str(out_dir / "audio.mp3")

    # Download best quality video (max 1080p to save time)
    subprocess.run([
        "yt-dlp",
        "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
        "--merge-output-format", "mp4",
        "-o", video_path,
        "--no-playlist",
        "--no-warnings",
        source_url,
    ], check=True, timeout=300)

    # Extract audio for Whisper
    subprocess.run([
        "ffmpeg", "-i", video_path,
        "-vn", "-acodec", "libmp3lame", "-ar", "16000", "-ac", "1",
        "-y", audio_path,
    ], check=True, timeout=120)

    # Get video duration
    result = subprocess.run([
        "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
        "-of", "json", video_path,
    ], capture_output=True, text=True, timeout=30)
    duration = float(json.loads(result.stdout)["format"]["duration"])

    # Get video dimensions
    result = subprocess.run([
        "ffprobe", "-v", "quiet", "-show_entries", "stream=width,height",
        "-of", "json", "-select_streams", "v:0", video_path,
    ], capture_output=True, text=True, timeout=30)
    streams = json.loads(result.stdout).get("streams", [{}])
    width = streams[0].get("width", 1920) if streams else 1920
    height = streams[0].get("height", 1080) if streams else 1080

    return {
        "video_path": video_path,
        "audio_path": audio_path,
        "duration": duration,
        "width": width,
        "height": height,
    }


# ═══════════════════════════════════════════════════════════
# STEP 2: Transcribe audio via OpenAI Whisper
# ═══════════════════════════════════════════════════════════
def transcribe_audio(audio_path: str) -> dict:
    """Transcribe audio using Whisper API with timestamps."""
    print(f"[Step 2] Transcribing: {audio_path}")

    # Check file size — Whisper API limit is 25MB
    file_size = os.path.getsize(audio_path)
    if file_size > 25 * 1024 * 1024:
        # Split into chunks if too large
        return transcribe_large_audio(audio_path)

    with open(audio_path, "rb") as f:
        response = openai.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )

    segments = []
    if hasattr(response, "segments") and response.segments:
        for seg in response.segments:
            segments.append({
                "start": seg.get("start", seg.get("start", 0)),
                "end": seg.get("end", seg.get("end", 0)),
                "text": seg.get("text", "").strip(),
            })

    full_text = response.text if hasattr(response, "text") else ""

    return {
        "full_text": full_text,
        "segments": segments,
    }


def transcribe_large_audio(audio_path: str) -> dict:
    """Split large audio files and transcribe in chunks."""
    print("[Step 2] Audio too large, splitting into 10-min chunks...")

    chunk_dir = Path(audio_path).parent / "audio_chunks"
    chunk_dir.mkdir(exist_ok=True)

    # Split into 10-minute chunks
    subprocess.run([
        "ffmpeg", "-i", audio_path,
        "-f", "segment", "-segment_time", "600",
        "-c", "copy", "-y",
        str(chunk_dir / "chunk_%03d.mp3"),
    ], check=True, timeout=120)

    all_segments = []
    full_text_parts = []
    time_offset = 0.0

    for chunk_file in sorted(chunk_dir.glob("chunk_*.mp3")):
        with open(str(chunk_file), "rb") as f:
            response = openai.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )

        if hasattr(response, "segments") and response.segments:
            for seg in response.segments:
                all_segments.append({
                    "start": seg.get("start", 0) + time_offset,
                    "end": seg.get("end", 0) + time_offset,
                    "text": seg.get("text", "").strip(),
                })

        full_text_parts.append(response.text if hasattr(response, "text") else "")

        # Get chunk duration for offset
        result = subprocess.run([
            "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
            "-of", "json", str(chunk_file),
        ], capture_output=True, text=True, timeout=30)
        chunk_duration = float(json.loads(result.stdout)["format"]["duration"])
        time_offset += chunk_duration

    return {
        "full_text": " ".join(full_text_parts),
        "segments": all_segments,
    }


# ═══════════════════════════════════════════════════════════
# STEP 3: GPT-4o finds viral moments in transcript
# ═══════════════════════════════════════════════════════════
def detect_viral_moments(transcript: dict, max_clips: int, clip_length: str, video_duration: float) -> list:
    """Use GPT-4o to analyze transcript and find the most viral-worthy moments."""
    print(f"[Step 3] Detecting {max_clips} viral moments (clip_length={clip_length})...")

    # Build segment text with timestamps
    segment_text = ""
    for seg in transcript["segments"]:
        segment_text += f"[{seg['start']:.1f}s - {seg['end']:.1f}s] {seg['text']}\n"

    # Clip length guidance
    length_guidance = {
        "15-30": "Each clip should be 15-30 seconds long.",
        "30-60": "Each clip should be 30-60 seconds long.",
        "15-60": "Each clip can be 15-60 seconds — pick the optimal length for each moment.",
    }.get(clip_length, "Each clip should be 30-60 seconds long.")

    prompt = f"""You are a viral content expert analyzing a video transcript to find the BEST moments for YouTube Shorts / TikTok / Reels.

VIDEO DURATION: {video_duration:.0f} seconds
TRANSCRIPT WITH TIMESTAMPS:
{segment_text}

TASK: Find exactly {max_clips} moments that would make the most viral short-form clips.
{length_guidance}

For each moment, provide:
1. start_time (seconds) — where the clip should begin (include 1-2s of lead-in for context)
2. end_time (seconds) — where the clip should end
3. hook_score (1-100) — virality potential score
4. reason — WHY this moment would go viral (emotional hook, surprise, controversy, humor, etc.)

CRITERIA FOR VIRAL MOMENTS:
- Strong opening hook (first 2 seconds must grab attention)
- Self-contained (makes sense without full video context)
- Emotional peak (surprise, humor, controversy, inspiration)
- High shareability (viewers will want to share or comment)
- Replay value (viewers will watch multiple times)

Rank by hook_score (highest first). Spread clips across the video — don't cluster them.

RESPOND ONLY WITH VALID JSON (no markdown, no backticks):
[
  {{
    "start_time": 45.0,
    "end_time": 78.5,
    "hook_score": 95,
    "reason": "Strong emotional revelation that creates curiosity"
  }}
]"""

    response = openai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=4000,
    )

    content = response.choices[0].message.content.strip()

    # Clean up response (remove markdown fences if present)
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()

    moments = json.loads(content)

    # Validate and clamp timestamps
    validated = []
    for m in moments[:max_clips]:
        start = max(0, float(m.get("start_time", 0)))
        end = min(video_duration, float(m.get("end_time", start + 30)))
        if end <= start:
            end = min(start + 30, video_duration)

        validated.append({
            "start_time": round(start, 1),
            "end_time": round(end, 1),
            "duration": round(end - start, 1),
            "hook_score": min(100, max(1, int(m.get("hook_score", 50)))),
            "reason": m.get("reason", "High engagement potential"),
        })

    # Sort by hook_score descending
    validated.sort(key=lambda x: x["hook_score"], reverse=True)

    return validated


# ═══════════════════════════════════════════════════════════
# STEP 4: FFmpeg extract clips + crop to 9:16
# ═══════════════════════════════════════════════════════════
def extract_clips(video_path: str, moments: list, crop_mode: str,
                  width: int, height: int, project_id: str) -> list:
    """Extract each clip and crop to 9:16 vertical format."""
    print(f"[Step 4] Extracting {len(moments)} clips (crop_mode={crop_mode})...")

    out_dir = WORK_DIR / project_id / "clips"
    out_dir.mkdir(exist_ok=True)

    # Calculate 9:16 crop dimensions from source
    # Target: 9:16 aspect ratio
    target_ratio = 9 / 16

    if width / height > target_ratio:
        # Source is wider than 9:16 — crop width
        crop_h = height
        crop_w = int(height * target_ratio)
    else:
        # Source is taller or equal — crop height
        crop_w = width
        crop_h = int(width / target_ratio)

    clips = []
    for i, moment in enumerate(moments):
        clip_id = f"clip-{i + 1}"
        clip_path = str(out_dir / f"{clip_id}.mp4")

        start = moment["start_time"]
        duration = moment["duration"]

        # Crop filter based on mode
        if crop_mode == "center":
            # Fixed center crop
            crop_filter = f"crop={crop_w}:{crop_h}:(iw-{crop_w})/2:(ih-{crop_h})/2"
        elif crop_mode == "dynamic":
            # Dynamic: start center, slight pan (simulated)
            crop_filter = f"crop={crop_w}:{crop_h}:(iw-{crop_w})/2:(ih-{crop_h})/2"
        else:
            # face-track: center crop (real face tracking requires ML model)
            # For now, center crop with slight upward bias (faces are usually in upper third)
            y_offset = max(0, int((height - crop_h) * 0.35))  # Bias upward
            x_offset = int((width - crop_w) / 2)
            crop_filter = f"crop={crop_w}:{crop_h}:{x_offset}:{y_offset}"

        # Scale to 1080x1920 (standard vertical)
        scale_filter = "scale=1080:1920"

        try:
            subprocess.run([
                "ffmpeg",
                "-ss", str(start),
                "-i", video_path,
                "-t", str(duration),
                "-vf", f"{crop_filter},{scale_filter}",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart",
                "-y", clip_path,
            ], check=True, timeout=120)

            clips.append({
                "id": clip_id,
                "index": i + 1,
                "path": clip_path,
                "start_time": moment["start_time"],
                "end_time": moment["end_time"],
                "duration": moment["duration"],
                "hook_score": moment["hook_score"],
                "reason": moment["reason"],
                "status": "done",
            })
        except Exception as e:
            print(f"[Step 4] Error extracting clip {clip_id}: {e}", file=sys.stderr)
            clips.append({
                "id": clip_id,
                "index": i + 1,
                "path": None,
                "start_time": moment["start_time"],
                "end_time": moment["end_time"],
                "duration": moment["duration"],
                "hook_score": moment["hook_score"],
                "reason": moment["reason"],
                "status": "error",
            })

    return clips


# ═══════════════════════════════════════════════════════════
# STEP 5: Burn captions onto clips
# ═══════════════════════════════════════════════════════════
def add_captions(clips: list, transcript: dict, caption_style: str, project_id: str) -> list:
    """Add captions to each clip using FFmpeg drawtext or ASS subtitles."""
    if caption_style == "none":
        print("[Step 5] Skipping captions (none selected)")
        return clips

    print(f"[Step 5] Adding {caption_style} captions to {len(clips)} clips...")

    out_dir = WORK_DIR / project_id / "captioned"
    out_dir.mkdir(exist_ok=True)

    for clip in clips:
        if clip["status"] != "done" or not clip.get("path"):
            continue

        # Find transcript segments that overlap with this clip
        clip_start = clip["start_time"]
        clip_end = clip["end_time"]
        clip_segments = []
        for seg in transcript["segments"]:
            if seg["end"] > clip_start and seg["start"] < clip_end:
                clip_segments.append({
                    "start": max(0, seg["start"] - clip_start),
                    "end": min(clip["duration"], seg["end"] - clip_start),
                    "text": seg["text"],
                })

        if not clip_segments:
            continue

        # Create SRT file for this clip
        srt_path = str(out_dir / f"{clip['id']}.srt")
        with open(srt_path, "w", encoding="utf-8") as f:
            for j, seg in enumerate(clip_segments):
                start_h = int(seg["start"] // 3600)
                start_m = int((seg["start"] % 3600) // 60)
                start_s = int(seg["start"] % 60)
                start_ms = int((seg["start"] % 1) * 1000)
                end_h = int(seg["end"] // 3600)
                end_m = int((seg["end"] % 3600) // 60)
                end_s = int(seg["end"] % 60)
                end_ms = int((seg["end"] % 1) * 1000)

                f.write(f"{j + 1}\n")
                f.write(f"{start_h:02d}:{start_m:02d}:{start_s:02d},{start_ms:03d} --> "
                        f"{end_h:02d}:{end_m:02d}:{end_s:02d},{end_ms:03d}\n")
                f.write(f"{seg['text']}\n\n")

        # Caption style settings
        captioned_path = str(out_dir / f"{clip['id']}_captioned.mp4")

        if caption_style == "centered":
            # Big centered text
            sub_filter = (
                f"subtitles={srt_path}:force_style="
                "'Alignment=5,FontSize=28,FontName=Arial,Bold=1,"
                "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
                "Outline=3,Shadow=1,MarginV=200'"
            )
        elif caption_style == "karaoke":
            # Bottom with highlight effect (simulated with bold style)
            sub_filter = (
                f"subtitles={srt_path}:force_style="
                "'Alignment=2,FontSize=24,FontName=Arial,Bold=1,"
                "PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,"
                "Outline=2,Shadow=1,MarginV=80'"
            )
        else:
            # block — standard bottom subtitles
            sub_filter = (
                f"subtitles={srt_path}:force_style="
                "'Alignment=2,FontSize=22,FontName=Arial,Bold=1,"
                "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
                "Outline=2,Shadow=1,MarginV=60,BackColour=&H80000000'"
            )

        try:
            subprocess.run([
                "ffmpeg",
                "-i", clip["path"],
                "-vf", sub_filter,
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "copy",
                "-y", captioned_path,
            ], check=True, timeout=120)

            clip["path"] = captioned_path
        except Exception as e:
            print(f"[Step 5] Caption error for {clip['id']}: {e}", file=sys.stderr)
            # Keep uncaptioned version

    return clips


# ═══════════════════════════════════════════════════════════
# STEP 6: Generate thumbnail per clip
# ═══════════════════════════════════════════════════════════
def generate_thumbnails(clips: list, project_id: str) -> list:
    """Extract a thumbnail frame from the most engaging moment of each clip."""
    print(f"[Step 6] Generating thumbnails for {len(clips)} clips...")

    out_dir = WORK_DIR / project_id / "thumbnails"
    out_dir.mkdir(exist_ok=True)

    for clip in clips:
        if clip["status"] != "done" or not clip.get("path"):
            continue

        thumb_path = str(out_dir / f"{clip['id']}_thumb.jpg")

        # Extract frame from 2 seconds in (past the hook moment)
        seek_time = min(2.0, clip["duration"] / 3)

        try:
            subprocess.run([
                "ffmpeg",
                "-ss", str(seek_time),
                "-i", clip["path"],
                "-vframes", "1",
                "-q:v", "2",
                "-y", thumb_path,
            ], check=True, timeout=30)

            clip["thumb_path"] = thumb_path
        except Exception as e:
            print(f"[Step 6] Thumbnail error for {clip['id']}: {e}", file=sys.stderr)

    return clips


# ═══════════════════════════════════════════════════════════
# STEP 7: GPT-4o generates titles & descriptions
# ═══════════════════════════════════════════════════════════
def generate_titles_descriptions(clips: list, transcript: dict, source_title: str) -> list:
    """Use GPT-4o to generate catchy titles and descriptions for each clip."""
    print(f"[Step 7] Generating titles & descriptions for {len(clips)} clips...")

    # Collect clip context
    clip_contexts = []
    for clip in clips:
        # Find transcript text for this clip
        clip_text = ""
        for seg in transcript["segments"]:
            if seg["end"] > clip["start_time"] and seg["start"] < clip["end_time"]:
                clip_text += seg["text"] + " "

        clip_contexts.append({
            "id": clip["id"],
            "index": clip["index"],
            "start_time": clip["start_time"],
            "end_time": clip["end_time"],
            "hook_score": clip["hook_score"],
            "reason": clip["reason"],
            "transcript_excerpt": clip_text.strip()[:500],
        })

    prompt = f"""Generate viral YouTube Shorts titles and descriptions for these clips extracted from the video "{source_title or 'Unknown'}".

CLIPS:
{json.dumps(clip_contexts, indent=2)}

For each clip, generate:
1. title — Maximum 60 chars. Must be a scroll-stopping hook. Use proven patterns: "You Won't Believe...", "The Secret to...", "Why 99% of people...", "I was wrong about...", question hooks, or controversy.
2. description — 2-3 sentences for YouTube Shorts description. Include relevant hashtags. Under 200 chars.

RESPOND ONLY WITH VALID JSON (no markdown):
[
  {{
    "id": "clip-1",
    "title": "The Title Here",
    "description": "Description here. #shorts #viral"
  }}
]"""

    response = openai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.8,
        max_tokens=3000,
    )

    content = response.choices[0].message.content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
    if content.endswith("```"):
        content = content[:-3]

    titles_data = json.loads(content.strip())

    # Merge titles into clips
    titles_map = {t["id"]: t for t in titles_data}
    for clip in clips:
        if clip["id"] in titles_map:
            clip["title"] = titles_map[clip["id"]].get("title", f"Best Moment #{clip['index']}")
            clip["description"] = titles_map[clip["id"]].get("description", "")
        else:
            clip["title"] = f"Best Moment #{clip['index']}"
            clip["description"] = f"An amazing clip from the original video. #shorts #viral"

    return clips


# ═══════════════════════════════════════════════════════════
# STEP 8: Upload clips + thumbnails to Supabase Storage
# ═══════════════════════════════════════════════════════════
def upload_to_storage(clips: list, project_id: str, user_id: str) -> list:
    """Upload clip videos and thumbnails to Supabase Storage."""
    print(f"[Step 8] Uploading {len(clips)} clips to Supabase Storage...")

    bucket = "shorts"

    for clip in clips:
        if clip["status"] != "done" or not clip.get("path"):
            continue

        # Upload video
        video_key = f"{user_id}/{project_id}/{clip['id']}.mp4"
        try:
            with open(clip["path"], "rb") as f:
                get_sb().storage.from_(bucket).upload(
                    video_key, f.read(),
                    file_options={"content-type": "video/mp4"}
                )

            clip["video_url"] = f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{video_key}"
        except Exception as e:
            print(f"[Step 8] Upload error for {clip['id']} video: {e}", file=sys.stderr)

        # Upload thumbnail
        if clip.get("thumb_path"):
            thumb_key = f"{user_id}/{project_id}/{clip['id']}_thumb.jpg"
            try:
                with open(clip["thumb_path"], "rb") as f:
                    get_sb().storage.from_(bucket).upload(
                        thumb_key, f.read(),
                        file_options={"content-type": "image/jpeg"}
                    )

                clip["thumbnail_url"] = f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{thumb_key}"
            except Exception as e:
                print(f"[Step 8] Upload error for {clip['id']} thumb: {e}", file=sys.stderr)

    return clips


# ═══════════════════════════════════════════════════════════
# STEP 9: Finalize — update Supabase with results
# ═══════════════════════════════════════════════════════════
def finalize(project_id: str, clips: list, transcript_text: str):
    """Write final clips JSONB and mark project as done."""
    print(f"[Step 9] Finalizing project {project_id}")

    # Clean clips for storage (remove local paths)
    clean_clips = []
    for clip in clips:
        clean_clips.append({
            "id": clip["id"],
            "index": clip["index"],
            "title": clip.get("title", f"Clip #{clip['index']}"),
            "description": clip.get("description", ""),
            "start_time": clip["start_time"],
            "end_time": clip["end_time"],
            "duration": clip["duration"],
            "hook_score": clip["hook_score"],
            "reason": clip["reason"],
            "video_url": clip.get("video_url"),
            "thumbnail_url": clip.get("thumbnail_url"),
            "status": clip["status"],
        })

    get_sb().table("shorts_projects").update({
        "status": "done",
        "progress_pct": 100,
        "progress_stage": "done",
        "clips": clean_clips,
        "transcript": transcript_text[:50000],  # Limit transcript storage
    }).eq("id", project_id).execute()


# ═══════════════════════════════════════════════════════════
# CLEANUP: Remove temp files
# ═══════════════════════════════════════════════════════════
def cleanup(project_id: str):
    """Remove temporary files for this project."""
    import shutil
    project_dir = WORK_DIR / project_id
    if project_dir.exists():
        shutil.rmtree(project_dir, ignore_errors=True)
    print(f"[Cleanup] Removed temp files for {project_id}")


# ═══════════════════════════════════════════════════════════
# MAIN PIPELINE: /shorts endpoint
# ═══════════════════════════════════════════════════════════
@app.route("/shorts", methods=["POST"])
def shorts_pipeline():
    """Full AI Shorts generation pipeline."""
    data = request.get_json(force=True)
    project_id = data.get("project_id")
    source_url = data.get("source_url")

    if not project_id or not source_url:
        return jsonify({"error": "project_id and source_url required"}), 400

    # Fetch project for user_id and settings
    try:
        result = get_sb().table("shorts_projects").select("*").eq("id", project_id).single().execute()
        project = result.data
    except Exception as e:
        return jsonify({"error": f"Project not found: {e}"}), 404

    user_id = project["user_id"]
    max_clips = project.get("max_clips", 5)
    clip_length = project.get("clip_length", "30-60")
    caption_style = project.get("caption_style", "karaoke")
    crop_mode = project.get("crop_mode", "face-track")
    do_thumbnails = project.get("generate_thumbnails", True)
    source_title = project.get("source_title", "")

    # Run pipeline (synchronous — Render handles the long-running process)
    try:
        # Step 1: Download
        update_progress(project_id, 5, "downloading")
        dl = download_video(source_url, project_id)

        # Update source duration
        get_sb().table("shorts_projects").update({
            "source_duration_sec": int(dl["duration"])
        }).eq("id", project_id).execute()

        # Step 2: Transcribe
        update_progress(project_id, 20, "transcribing")
        transcript = transcribe_audio(dl["audio_path"])

        # Step 3: Detect viral moments
        update_progress(project_id, 40, "analyzing")
        moments = detect_viral_moments(transcript, max_clips, clip_length, dl["duration"])

        # Step 4: Extract clips + crop 9:16
        update_progress(project_id, 55, "clipping")
        clips = extract_clips(dl["video_path"], moments, crop_mode,
                              dl["width"], dl["height"], project_id)

        # Step 5: Add captions
        update_progress(project_id, 70, "captioning")
        clips = add_captions(clips, transcript, caption_style, project_id)

        # Step 6: Generate thumbnails
        if do_thumbnails:
            update_progress(project_id, 80, "thumbnails")
            clips = generate_thumbnails(clips, project_id)

        # Step 7: Generate titles & descriptions
        update_progress(project_id, 85, "analyzing")
        clips = generate_titles_descriptions(clips, transcript, source_title)

        # Step 8: Upload to Supabase Storage
        update_progress(project_id, 90, "uploading")
        clips = upload_to_storage(clips, project_id, user_id)

        # Step 9: Finalize
        update_progress(project_id, 98, "done")
        finalize(project_id, clips, transcript["full_text"])

        # Cleanup temp files
        cleanup(project_id)

        return jsonify({"status": "done", "clips": len(clips)}), 200

    except Exception as e:
        error_msg = str(e)
        traceback.print_exc()
        update_progress(project_id, 0, "error", error=error_msg)
        cleanup(project_id)
        return jsonify({"error": error_msg}), 500


# ═══════════════════════════════════════════════════════════
# HEALTH CHECK
# ═══════════════════════════════════════════════════════════
@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "autovideo-worker",
        "supabase_url_set": bool(SUPABASE_URL),
        "supabase_key_set": bool(SUPABASE_KEY),
        "supabase_key_len": len(SUPABASE_KEY) if SUPABASE_KEY else 0,
        "openai_key_set": bool(os.environ.get("OPENAI_API_KEY")),
    }), 200


@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "ok", "endpoints": ["/shorts", "/dub", "/health"]}), 200


# ═══════════════════════════════════════════════════════════
# RUN
# ═══════════════════════════════════════════════════════════
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port, debug=False)

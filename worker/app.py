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
  1. Download YouTube video via yt-dlp (with Node.js JS runtime)
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
import threading
import base64
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
        print(f"[init] Supabase URL: {url[:30]}...", file=sys.stderr, flush=True)
        print(f"[init] Supabase KEY: {key[:20]}... (len={len(key)})", file=sys.stderr, flush=True)
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

# ── YouTube cookies (decode from base64 env var if set) ──
COOKIES_PATH = str(WORK_DIR / "cookies.txt")
_yt_cookies_b64 = os.environ.get("YT_COOKIES_BASE64", "")
if _yt_cookies_b64:
    try:
        cookie_bytes = base64.b64decode(_yt_cookies_b64)
        with open(COOKIES_PATH, "wb") as f:
            f.write(cookie_bytes)
        print(f"[init] YouTube cookies loaded ({len(cookie_bytes)} bytes)", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"[init] Failed to decode YT_COOKIES_BASE64: {e}", file=sys.stderr, flush=True)
        COOKIES_PATH = None
else:
    COOKIES_PATH = None
    print("[init] No YT_COOKIES_BASE64 set — downloads may be blocked", file=sys.stderr, flush=True)


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
        print(f"[update_progress] Error: {e}", file=sys.stderr, flush=True)


# ═══════════════════════════════════════════════════════════
# STEP 1: Download YouTube video via yt-dlp (with Node.js)
# ═══════════════════════════════════════════════════════════
def download_video(source_url: str, project_id: str) -> dict:
    """Download video + audio using yt-dlp with Node.js JS runtime. Returns paths dict."""
    print(f"[Step 1] Downloading: {source_url}", file=sys.stderr, flush=True)

    out_dir = WORK_DIR / project_id
    out_dir.mkdir(exist_ok=True)

    video_path = str(out_dir / "source.mp4")
    audio_path = str(out_dir / "audio.mp3")
    raw_output = str(out_dir / "source.%(ext)s")

    # Debug: print yt-dlp and Node.js versions
    try:
        ver = subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True, timeout=10)
        print(f"[Step 1] yt-dlp version: {ver.stdout.strip()}", file=sys.stderr, flush=True)
        node_ver = subprocess.run(["node", "--version"], capture_output=True, text=True, timeout=10)
        print(f"[Step 1] Node.js version: {node_ver.stdout.strip()}", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"[Step 1] Debug failed: {e}", file=sys.stderr, flush=True)

    # Base command — --js-runtimes node is the KEY FIX for YouTube JS challenge
    base_cmd = [
        "yt-dlp",
        "--js-runtimes", "node",
        "-o", raw_output,
        "--no-playlist",
        "--no-check-certificates",
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ]
    if COOKIES_PATH and os.path.exists(COOKIES_PATH):
        base_cmd.extend(["--cookies", COOKIES_PATH])

    # Download strategies — Node.js runtime handles JS challenge, so fewer needed
    strategies = [
        {"label": "Default + Node.js runtime", "extra_args": []},
        {"label": "TV embedded client + Node.js", "extra_args": ["--extractor-args", "youtube:player_client=tv_embedded"]},
        {"label": "Web client + Node.js", "extra_args": ["--extractor-args", "youtube:player_client=web"]},
    ]

    downloaded = False
    for i, strat in enumerate(strategies):
        print(f"[Step 1] Attempt {i+1}/{len(strategies)}: {strat['label']}", file=sys.stderr, flush=True)
        cmd = base_cmd + strat["extra_args"] + [source_url]

        try:
            result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=600)
            if result.stderr:
                print(f"[Step 1] stderr: {result.stderr[:500]}", file=sys.stderr, flush=True)
            downloaded = True
            print(f"[Step 1] SUCCESS with strategy {i+1}: {strat['label']}", file=sys.stderr, flush=True)
            break
        except subprocess.CalledProcessError as e:
            stderr_msg = e.stderr[:300] if e.stderr else str(e)
            print(f"[Step 1] Strategy {i+1} failed: {stderr_msg}", file=sys.stderr, flush=True)
            # Clean up partial downloads
            for partial in out_dir.glob("source.*"):
                if partial.suffix != ".mp3":
                    partial.unlink(missing_ok=True)

    if not downloaded:
        raise RuntimeError("All download strategies failed. YouTube may be blocking this server. Try re-exporting fresh cookies.")

    # Find the downloaded file (could be .mp4, .webm, .mkv, etc.)
    downloaded_file = None
    for found in out_dir.glob("source.*"):
        if found.suffix not in (".mp3", ".part"):
            downloaded_file = str(found)
            break

    if not downloaded_file:
        raise RuntimeError("Download appeared to succeed but no file found.")

    print(f"[Step 1] Downloaded file: {downloaded_file}", file=sys.stderr, flush=True)

    # Convert to mp4 if needed
    if not downloaded_file.endswith(".mp4"):
        print(f"[Step 1] Converting {Path(downloaded_file).name} to mp4...", file=sys.stderr, flush=True)
        subprocess.run([
            "ffmpeg", "-i", downloaded_file,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            "-y", video_path,
        ], check=True, timeout=600)
        os.remove(downloaded_file)
    else:
        if downloaded_file != video_path:
            os.rename(downloaded_file, video_path)

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
    print(f"[Step 2] Transcribing: {audio_path}", file=sys.stderr, flush=True)

    file_size = os.path.getsize(audio_path)
    if file_size > 25 * 1024 * 1024:
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
    print("[Step 2] Audio too large, splitting into 10-min chunks...", file=sys.stderr, flush=True)

    chunk_dir = Path(audio_path).parent / "audio_chunks"
    chunk_dir.mkdir(exist_ok=True)

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
    print(f"[Step 3] Detecting {max_clips} viral moments (clip_length={clip_length})...", file=sys.stderr, flush=True)

    segment_text = ""
    for seg in transcript["segments"]:
        segment_text += f"[{seg['start']:.1f}s - {seg['end']:.1f}s] {seg['text']}\n"

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

    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()

    moments = json.loads(content)

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

    validated.sort(key=lambda x: x["hook_score"], reverse=True)

    return validated


# ═══════════════════════════════════════════════════════════
# STEP 4: FFmpeg extract clips + crop to 9:16
# ═══════════════════════════════════════════════════════════
def extract_clips(video_path: str, moments: list, crop_mode: str,
                  width: int, height: int, project_id: str) -> list:
    """Extract each clip and crop to 9:16 vertical format."""
    print(f"[Step 4] Extracting {len(moments)} clips (crop_mode={crop_mode})...", file=sys.stderr, flush=True)

    out_dir = WORK_DIR / project_id / "clips"
    out_dir.mkdir(exist_ok=True)

    target_ratio = 9 / 16

    if width / height > target_ratio:
        crop_h = height
        crop_w = int(height * target_ratio)
    else:
        crop_w = width
        crop_h = int(width / target_ratio)

    clips = []
    for i, moment in enumerate(moments):
        clip_id = f"clip-{i + 1}"
        clip_path = str(out_dir / f"{clip_id}.mp4")

        start = moment["start_time"]
        duration = moment["duration"]

        if crop_mode == "center":
            crop_filter = f"crop={crop_w}:{crop_h}:(iw-{crop_w})/2:(ih-{crop_h})/2"
        elif crop_mode == "dynamic":
            crop_filter = f"crop={crop_w}:{crop_h}:(iw-{crop_w})/2:(ih-{crop_h})/2"
        else:
            y_offset = max(0, int((height - crop_h) * 0.35))
            x_offset = int((width - crop_w) / 2)
            crop_filter = f"crop={crop_w}:{crop_h}:{x_offset}:{y_offset}"

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
            print(f"[Step 4] Error extracting clip {clip_id}: {e}", file=sys.stderr, flush=True)
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
        print("[Step 5] Skipping captions (none selected)", file=sys.stderr, flush=True)
        return clips

    print(f"[Step 5] Adding {caption_style} captions to {len(clips)} clips...", file=sys.stderr, flush=True)

    out_dir = WORK_DIR / project_id / "captioned"
    out_dir.mkdir(exist_ok=True)

    for clip in clips:
        if clip["status"] != "done" or not clip.get("path"):
            continue

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

        captioned_path = str(out_dir / f"{clip['id']}_captioned.mp4")

        if caption_style == "centered":
            sub_filter = (
                f"subtitles={srt_path}:force_style="
                "'Alignment=5,FontSize=28,FontName=Arial,Bold=1,"
                "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
                "Outline=3,Shadow=1,MarginV=200'"
            )
        elif caption_style == "karaoke":
            sub_filter = (
                f"subtitles={srt_path}:force_style="
                "'Alignment=2,FontSize=24,FontName=Arial,Bold=1,"
                "PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,"
                "Outline=2,Shadow=1,MarginV=80'"
            )
        else:
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
            print(f"[Step 5] Caption error for {clip['id']}: {e}", file=sys.stderr, flush=True)

    return clips


# ═══════════════════════════════════════════════════════════
# STEP 6: Generate thumbnail per clip
# ═══════════════════════════════════════════════════════════
def generate_thumbnails(clips: list, project_id: str) -> list:
    """Extract a thumbnail frame from the most engaging moment of each clip."""
    print(f"[Step 6] Generating thumbnails for {len(clips)} clips...", file=sys.stderr, flush=True)

    out_dir = WORK_DIR / project_id / "thumbnails"
    out_dir.mkdir(exist_ok=True)

    for clip in clips:
        if clip["status"] != "done" or not clip.get("path"):
            continue

        thumb_path = str(out_dir / f"{clip['id']}_thumb.jpg")
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
            print(f"[Step 6] Thumbnail error for {clip['id']}: {e}", file=sys.stderr, flush=True)

    return clips


# ═══════════════════════════════════════════════════════════
# STEP 7: GPT-4o generates titles & descriptions
# ═══════════════════════════════════════════════════════════
def generate_titles_descriptions(clips: list, transcript: dict, source_title: str) -> list:
    """Use GPT-4o to generate catchy titles and descriptions for each clip."""
    print(f"[Step 7] Generating titles & descriptions for {len(clips)} clips...", file=sys.stderr, flush=True)

    clip_contexts = []
    for clip in clips:
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
    print(f"[Step 8] Uploading {len(clips)} clips to Supabase Storage...", file=sys.stderr, flush=True)

    bucket = "shorts"

    for clip in clips:
        if clip["status"] != "done" or not clip.get("path"):
            continue

        video_key = f"{user_id}/{project_id}/{clip['id']}.mp4"
        try:
            with open(clip["path"], "rb") as f:
                get_sb().storage.from_(bucket).upload(
                    video_key, f.read(),
                    file_options={"content-type": "video/mp4"}
                )

            clip["video_url"] = f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{video_key}"
        except Exception as e:
            print(f"[Step 8] Upload error for {clip['id']} video: {e}", file=sys.stderr, flush=True)

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
                print(f"[Step 8] Upload error for {clip['id']} thumb: {e}", file=sys.stderr, flush=True)

    return clips


# ═══════════════════════════════════════════════════════════
# STEP 9: Finalize — update Supabase with results
# ═══════════════════════════════════════════════════════════
def finalize(project_id: str, clips: list, transcript_text: str):
    """Write final clips JSONB and mark project as done."""
    print(f"[Step 9] Finalizing project {project_id}", file=sys.stderr, flush=True)

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
        "transcript": transcript_text[:50000],
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
    print(f"[Cleanup] Removed temp files for {project_id}", file=sys.stderr, flush=True)


# ═══════════════════════════════════════════════════════════
# MAIN PIPELINE: /shorts endpoint
# ═══════════════════════════════════════════════════════════
def run_pipeline(project_id, source_url):
    """Run the full shorts pipeline in a background thread."""
    print(f"[Pipeline] Starting for project {project_id}", file=sys.stderr, flush=True)

    try:
        result = get_sb().table("shorts_projects").select("*").eq("id", project_id).single().execute()
        project = result.data
        print(f"[Pipeline] Fetched project: status={project['status']}", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"[Pipeline] ERROR fetching project: {e}", file=sys.stderr, flush=True)
        update_progress(project_id, 0, "error", error=f"Project not found: {e}")
        return

    user_id = project["user_id"]
    max_clips = project.get("max_clips", 5)
    clip_length = project.get("clip_length", "30-60")
    caption_style = project.get("caption_style", "karaoke")
    crop_mode = project.get("crop_mode", "face-track")
    do_thumbnails = project.get("generate_thumbnails", True)
    source_title = project.get("source_title", "")

    try:
        # Step 1: Download
        print(f"[Pipeline] Step 1: Downloading {source_url}", file=sys.stderr, flush=True)
        update_progress(project_id, 5, "downloading")
        dl = download_video(source_url, project_id)
        print(f"[Pipeline] Step 1 done: duration={dl['duration']}s, {dl['width']}x{dl['height']}", file=sys.stderr, flush=True)

        get_sb().table("shorts_projects").update({
            "source_duration_sec": int(dl["duration"])
        }).eq("id", project_id).execute()

        # Step 2: Transcribe
        print("[Pipeline] Step 2: Transcribing...", file=sys.stderr, flush=True)
        update_progress(project_id, 20, "transcribing")
        transcript = transcribe_audio(dl["audio_path"])
        print(f"[Pipeline] Step 2 done: {len(transcript['segments'])} segments", file=sys.stderr, flush=True)

        # Step 3: Detect viral moments
        print(f"[Pipeline] Step 3: Analyzing for {max_clips} viral moments...", file=sys.stderr, flush=True)
        update_progress(project_id, 40, "analyzing")
        moments = detect_viral_moments(transcript, max_clips, clip_length, dl["duration"])
        print(f"[Pipeline] Step 3 done: found {len(moments)} moments", file=sys.stderr, flush=True)

        # Step 4: Extract clips + crop 9:16
        print("[Pipeline] Step 4: Extracting clips...", file=sys.stderr, flush=True)
        update_progress(project_id, 55, "clipping")
        clips = extract_clips(dl["video_path"], moments, crop_mode,
                              dl["width"], dl["height"], project_id)
        print(f"[Pipeline] Step 4 done: {len(clips)} clips", file=sys.stderr, flush=True)

        # Step 5: Add captions
        print(f"[Pipeline] Step 5: Adding captions ({caption_style})...", file=sys.stderr, flush=True)
        update_progress(project_id, 70, "captioning")
        clips = add_captions(clips, transcript, caption_style, project_id)
        print("[Pipeline] Step 5 done", file=sys.stderr, flush=True)

        # Step 6: Generate thumbnails
        if do_thumbnails:
            print("[Pipeline] Step 6: Generating thumbnails...", file=sys.stderr, flush=True)
            update_progress(project_id, 80, "thumbnails")
            clips = generate_thumbnails(clips, project_id)
            print("[Pipeline] Step 6 done", file=sys.stderr, flush=True)

        # Step 7: Generate titles & descriptions
        print("[Pipeline] Step 7: Generating titles...", file=sys.stderr, flush=True)
        update_progress(project_id, 85, "analyzing")
        clips = generate_titles_descriptions(clips, transcript, source_title)
        print("[Pipeline] Step 7 done", file=sys.stderr, flush=True)

        # Step 8: Upload to Supabase Storage
        print("[Pipeline] Step 8: Uploading clips...", file=sys.stderr, flush=True)
        update_progress(project_id, 90, "uploading")
        clips = upload_to_storage(clips, project_id, user_id)
        print("[Pipeline] Step 8 done", file=sys.stderr, flush=True)

        # Step 9: Finalize
        print("[Pipeline] Step 9: Finalizing...", file=sys.stderr, flush=True)
        update_progress(project_id, 98, "done")
        finalize(project_id, clips, transcript["full_text"])
        print(f"[Pipeline] COMPLETE! {len(clips)} clips generated.", file=sys.stderr, flush=True)

        cleanup(project_id)

    except Exception as e:
        error_msg = str(e)
        print(f"[Pipeline] ERROR: {error_msg}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        update_progress(project_id, 0, "error", error=error_msg)
        cleanup(project_id)


@app.route("/shorts", methods=["POST"])
def shorts_endpoint():
    """Receive request and run pipeline in background thread."""
    data = request.get_json(force=True)
    project_id = data.get("project_id")
    source_url = data.get("source_url")

    print(f"[/shorts] Received: project_id={project_id}, source_url={source_url}", file=sys.stderr, flush=True)

    if not project_id or not source_url:
        return jsonify({"error": "project_id and source_url required"}), 400

    thread = threading.Thread(target=run_pipeline, args=(project_id, source_url))
    thread.daemon = True
    thread.start()

    print(f"[/shorts] Pipeline thread started for {project_id}", file=sys.stderr, flush=True)
    return jsonify({"message": "Pipeline started", "project_id": project_id}), 200


# ═══════════════════════════════════════════════════════════
# HEALTH CHECK
# ═══════════════════════════════════════════════════════════
@app.route("/health", methods=["GET"])
def health():
    # Check if Node.js is available
    node_available = False
    node_version = "not found"
    try:
        result = subprocess.run(["node", "--version"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            node_available = True
            node_version = result.stdout.strip()
    except Exception:
        pass

    # Check yt-dlp version
    ytdlp_version = "not found"
    try:
        result = subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            ytdlp_version = result.stdout.strip()
    except Exception:
        pass

    return jsonify({
        "status": "ok",
        "service": "autovideo-worker",
        "supabase_url_set": bool(SUPABASE_URL),
        "supabase_key_set": bool(SUPABASE_KEY),
        "supabase_key_len": len(SUPABASE_KEY) if SUPABASE_KEY else 0,
        "openai_key_set": bool(os.environ.get("OPENAI_API_KEY")),
        "cookies_loaded": COOKIES_PATH is not None and os.path.exists(COOKIES_PATH) if COOKIES_PATH else False,
        "node_available": node_available,
        "node_version": node_version,
        "ytdlp_version": ytdlp_version,
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

"""
============================================================
FILE: worker/app.py  (v3 — CONTENT QUALITY + CAPTION STYLES)
============================================================
Render.com Worker — AI Shorts Generator Pipeline

FIXES v3:
  ✅ FIX A: GPT prompt rewritten for COMPLETE STORY ARCS
            + sentence-boundary snapping after GPT returns
  ✅ FIX B: 3 visually DISTINCT caption styles:
            - Karaoke = gold/yellow highlight, lower-center, no bg box
            - Block   = white text with semi-transparent background box
            - Centered = large white text, screen center, cinematic outline
  ✅ FIX (v2): Hard duration enforcement (30-60s etc.)
  ✅ FIX (v2): +0.5s audio buffer (no last-word cutoff)
  ✅ FIX (v2): UPPERCASE text for cinematic look
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

# ── Audio buffer to prevent last-word cutoff ─────────────
AUDIO_BUFFER = 0.5

# ── YouTube cookies ──────────────────────────────────────
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
# HELPERS
# ═══════════════════════════════════════════════════════════
def parse_clip_length(clip_length: str) -> tuple:
    """Parse clip_length like '30-60' into (30, 60)."""
    try:
        parts = str(clip_length).split("-")
        if len(parts) == 2:
            lo, hi = int(parts[0].strip()), int(parts[1].strip())
            if lo > 0 and hi > 0 and hi >= lo:
                return (lo, hi)
    except Exception:
        pass
    return (30, 60)


def update_progress(project_id: str, pct: int, stage: str, clips=None, error=None):
    data = {"progress_pct": pct, "progress_stage": stage}
    if clips is not None:
        data["clips"] = clips
    if error:
        data["status"] = "error"
        data["error_message"] = error
    try:
        get_sb().table("shorts_projects").update(data).eq("id", project_id).execute()
    except Exception as e:
        print(f"[update_progress] Error: {e}", file=sys.stderr, flush=True)


def snap_to_segment_boundary(time_val: float, segments: list, mode: str = "nearest") -> float:
    """
    Snap a timestamp to the nearest segment boundary so we never cut mid-sentence.
    mode='start' → snap to nearest segment START time
    mode='end'   → snap to nearest segment END time
    """
    if not segments:
        return time_val

    best = time_val
    best_dist = float("inf")

    for seg in segments:
        if mode == "start":
            dist = abs(seg["start"] - time_val)
            if dist < best_dist:
                best_dist = dist
                best = seg["start"]
        elif mode == "end":
            dist = abs(seg["end"] - time_val)
            if dist < best_dist:
                best_dist = dist
                best = seg["end"]
        else:
            for boundary in [seg["start"], seg["end"]]:
                dist = abs(boundary - time_val)
                if dist < best_dist:
                    best_dist = dist
                    best = boundary

    return best


# ═══════════════════════════════════════════════════════════
# STEP 1: Download YouTube video via yt-dlp
# ═══════════════════════════════════════════════════════════
def download_video(source_url: str, project_id: str) -> dict:
    print(f"[Step 1] Downloading: {source_url}", file=sys.stderr, flush=True)

    out_dir = WORK_DIR / project_id
    out_dir.mkdir(exist_ok=True)

    video_path = str(out_dir / "source.mp4")
    audio_path = str(out_dir / "audio.mp3")
    raw_output = str(out_dir / "source.%(ext)s")

    try:
        ver = subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True, timeout=10)
        print(f"[Step 1] yt-dlp version: {ver.stdout.strip()}", file=sys.stderr, flush=True)
        node_ver = subprocess.run(["node", "--version"], capture_output=True, text=True, timeout=10)
        print(f"[Step 1] Node.js version: {node_ver.stdout.strip()}", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"[Step 1] Debug failed: {e}", file=sys.stderr, flush=True)

    base_cmd = [
        "yt-dlp",
        "--js-runtimes", "node",
        "-f", "bv[vcodec^=avc1][height<=720]+ba[acodec^=mp4a]/bv[vcodec^=avc1][height<=720]+ba/bv*[height<=720]+ba/b",
        "--merge-output-format", "mp4",
        "-o", raw_output,
        "--no-playlist",
        "--no-check-certificates",
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ]
    if COOKIES_PATH and os.path.exists(COOKIES_PATH):
        base_cmd.extend(["--cookies", COOKIES_PATH])

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
            print(f"[Step 1] SUCCESS with strategy {i+1}", file=sys.stderr, flush=True)
            break
        except subprocess.CalledProcessError as e:
            stderr_msg = e.stderr[:300] if e.stderr else str(e)
            print(f"[Step 1] Strategy {i+1} failed: {stderr_msg}", file=sys.stderr, flush=True)
            for partial in out_dir.glob("source.*"):
                if partial.suffix != ".mp3":
                    partial.unlink(missing_ok=True)

    if not downloaded:
        raise RuntimeError("All download strategies failed. YouTube may be blocking this server.")

    downloaded_file = None
    for found in out_dir.glob("source.*"):
        if found.suffix not in (".mp3", ".part"):
            downloaded_file = str(found)
            break
    if not downloaded_file:
        raise RuntimeError("Download succeeded but no file found.")

    if not downloaded_file.endswith(".mp4"):
        subprocess.run([
            "ffmpeg", "-i", downloaded_file,
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
            "-vf", "scale=-2:720", "-c:a", "aac", "-b:a", "128k",
            "-threads", "1", "-movflags", "+faststart", "-y", video_path,
        ], check=True, timeout=600)
        os.remove(downloaded_file)
    else:
        if downloaded_file != video_path:
            os.rename(downloaded_file, video_path)

    subprocess.run([
        "ffmpeg", "-i", video_path, "-vn", "-acodec", "libmp3lame",
        "-ar", "16000", "-ac", "1", "-y", audio_path,
    ], check=True, timeout=120)

    result = subprocess.run([
        "ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "json", video_path,
    ], capture_output=True, text=True, timeout=30)
    duration = float(json.loads(result.stdout)["format"]["duration"])

    result = subprocess.run([
        "ffprobe", "-v", "quiet", "-show_entries", "stream=width,height",
        "-of", "json", "-select_streams", "v:0", video_path,
    ], capture_output=True, text=True, timeout=30)
    streams = json.loads(result.stdout).get("streams", [{}])
    width = streams[0].get("width", 1920) if streams else 1920
    height = streams[0].get("height", 1080) if streams else 1080

    return {"video_path": video_path, "audio_path": audio_path, "duration": duration, "width": width, "height": height}


# ═══════════════════════════════════════════════════════════
# STEP 2: Transcribe audio via OpenAI Whisper
# ═══════════════════════════════════════════════════════════
def transcribe_audio(audio_path: str) -> dict:
    print(f"[Step 2] Transcribing: {audio_path}", file=sys.stderr, flush=True)

    file_size = os.path.getsize(audio_path)
    if file_size > 25 * 1024 * 1024:
        return transcribe_large_audio(audio_path)

    with open(audio_path, "rb") as f:
        response = openai.audio.transcriptions.create(
            model="whisper-1", file=f,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )

    segments = []
    if hasattr(response, "segments") and response.segments:
        for seg in response.segments:
            segments.append({
                "start": seg.get("start", 0),
                "end": seg.get("end", 0),
                "text": seg.get("text", "").strip(),
            })

    return {"full_text": response.text if hasattr(response, "text") else "", "segments": segments}


def transcribe_large_audio(audio_path: str) -> dict:
    print("[Step 2] Audio too large, splitting...", file=sys.stderr, flush=True)
    chunk_dir = Path(audio_path).parent / "audio_chunks"
    chunk_dir.mkdir(exist_ok=True)
    subprocess.run([
        "ffmpeg", "-i", audio_path, "-f", "segment", "-segment_time", "600",
        "-c", "copy", "-y", str(chunk_dir / "chunk_%03d.mp3"),
    ], check=True, timeout=120)

    all_segments = []
    full_text_parts = []
    time_offset = 0.0

    for chunk_file in sorted(chunk_dir.glob("chunk_*.mp3")):
        with open(str(chunk_file), "rb") as f:
            response = openai.audio.transcriptions.create(
                model="whisper-1", file=f,
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
            "ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "json", str(chunk_file),
        ], capture_output=True, text=True, timeout=30)
        time_offset += float(json.loads(result.stdout)["format"]["duration"])

    return {"full_text": " ".join(full_text_parts), "segments": all_segments}


# ═══════════════════════════════════════════════════════════
# STEP 3: GPT-4o finds viral moments
#   ✅ v3: COMPLETE STORY ARC prompt + sentence boundary snapping
# ═══════════════════════════════════════════════════════════
def detect_viral_moments(transcript: dict, max_clips: int, clip_length: str,
                         video_duration: float, clip_min_sec: int, clip_max_sec: int) -> list:
    print(f"[Step 3] Detecting {max_clips} moments ({clip_min_sec}-{clip_max_sec}s)...",
          file=sys.stderr, flush=True)

    segments = transcript["segments"]
    segment_text = ""
    for seg in segments:
        m = int(seg["start"] // 60)
        s = int(seg["start"] % 60)
        segment_text += f"[{m}:{s:02d} / {seg['start']:.1f}s] {seg['text']}\n"

    # ═══════════════════════════════════════════════════════
    # ✅ v3: COMPLETE STORY ARC prompt
    # ═══════════════════════════════════════════════════════
    prompt = f"""You are a world-class viral content editor for YouTube Shorts, TikTok, and Reels. Your clips get MILLIONS of views because every one tells a complete, satisfying story.

VIDEO DURATION: {video_duration:.0f} seconds

TRANSCRIPT WITH TIMESTAMPS:
{segment_text}

TASK: Find exactly {max_clips} clips. Each MUST be {clip_min_sec}-{clip_max_sec} seconds long.

═══ THE #1 RULE: COMPLETE STORY ARC ═══
Each clip MUST have ALL THREE parts — this is non-negotiable:

1. HOOK (first 3 seconds) — A statement that creates instant curiosity.
   The viewer must think "Wait, what? I need to hear this."
   Examples: "Most people get this wrong...", "I learned this the hard way...",
   "Here's what nobody tells you..."

2. DEVELOPMENT (middle 70%) — The story, explanation, evidence, or build-up.
   This keeps the viewer watching. It must FLOW logically from the hook.

3. PAYOFF / CONCLUSION (last 5-10 seconds) — The punchline, revelation, lesson,
   or takeaway. The viewer must feel SATISFIED and REWARDED.
   The speaker must FINISH their point. The thought must be COMPLETE.

═══ WHAT MAKES A CLIP FEEL "UNFINISHED" (AVOID THESE): ═══
- Speaker says "and the reason is..." but the clip cuts before the reason
- Speaker is building to a conclusion but clip ends during the build-up
- Speaker says "there are 3 things..." but clip only covers 1-2 of them
- Clip ends with "so..." or "and that's why..." without the conclusion
- The viewer is left thinking "wait, what happened next?"

═══ WHAT MAKES A CLIP FEEL "COMPLETE" (DO THESE): ═══
- Speaker makes a bold claim → explains it → delivers the insight
- Speaker tells a mini-story with a clear beginning, middle, and end
- Speaker asks a question → explores it → gives a satisfying answer
- The last sentence feels like a natural ending or quotable takeaway
- The viewer feels "wow, that was a complete thought — I want to share this"

═══ DURATION RULES: ═══
- end_time minus start_time MUST be between {clip_min_sec} and {clip_max_sec} seconds
- Start 1-2 seconds BEFORE the hook (breathing room)
- End 1-2 seconds AFTER the final conclusion lands (let it breathe)
- Clips must NOT overlap. Spread them across the full video.

═══ SCORING: ═══
- 90-100: Viral gold — amazing hook AND satisfying payoff
- 70-89: Strong — clear arc, engaging content
- Below 70: Don't include. Find something better.

RESPOND WITH VALID JSON ONLY (no markdown, no backticks):
[
  {{
    "start_time": 45.0,
    "end_time": 78.5,
    "hook_score": 95,
    "reason": "Opens with provocative claim, builds with personal story, ends with quotable insight"
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

    moments = json.loads(content.strip())

    # ═══════════════════════════════════════════════════════
    # POST-PROCESSING: Sentence boundary snapping + duration enforcement
    # ═══════════════════════════════════════════════════════
    validated = []
    for i, m in enumerate(moments[:max_clips]):
        raw_start = max(0, float(m.get("start_time", 0)))
        raw_end = min(video_duration, float(m.get("end_time", raw_start + clip_min_sec)))

        # Snap to sentence boundaries
        start = snap_to_segment_boundary(raw_start, segments, mode="start")
        end = snap_to_segment_boundary(raw_end, segments, mode="end")

        # Add breathing room: 1s before, 0.5s after
        start = max(0, start - 1.0)
        end = min(video_duration, end + 0.5)
        dur = end - start

        # Hard enforcement: too short
        if dur < clip_min_sec:
            needed = clip_min_sec - dur
            end = min(video_duration, end + needed)
            dur = end - start
            if dur < clip_min_sec:
                start = max(0, start - (clip_min_sec - dur))
                dur = end - start
            # Re-snap extended end
            end = snap_to_segment_boundary(end, segments, mode="end")
            end = min(video_duration, end + 0.5)
            dur = end - start
            if dur < clip_min_sec:
                end = min(video_duration, start + clip_min_sec)
                dur = end - start
            print(f"[Step 3] #{i+1}: EXTENDED {raw_end-raw_start:.0f}s → {dur:.0f}s",
                  file=sys.stderr, flush=True)

        # Hard enforcement: too long
        if dur > clip_max_sec:
            old_dur = dur
            end = start + clip_max_sec
            snapped = snap_to_segment_boundary(end, segments, mode="end")
            if snapped <= start + clip_max_sec + 3:
                end = snapped
            else:
                end = start + clip_max_sec
            dur = end - start
            print(f"[Step 3] #{i+1}: TRIMMED {old_dur:.0f}s → {dur:.0f}s",
                  file=sys.stderr, flush=True)

        start = max(0, start)
        end = min(video_duration, end)
        dur = end - start

        validated.append({
            "start_time": round(start, 2),
            "end_time": round(end, 2),
            "duration": round(dur, 2),
            "hook_score": min(100, max(1, int(m.get("hook_score", 50)))),
            "reason": m.get("reason", "High engagement potential"),
        })

    validated.sort(key=lambda x: x["hook_score"], reverse=True)

    print(f"[Step 3] ✅ {len(validated)} clips with complete arcs:",
          file=sys.stderr, flush=True)
    for v in validated:
        print(f"  → {v['start_time']:.1f}-{v['end_time']:.1f}s = {v['duration']:.0f}s "
              f"(score={v['hook_score']})", file=sys.stderr, flush=True)

    return validated


# ═══════════════════════════════════════════════════════════
# STEP 4: FFmpeg extract clips + crop 9:16 + audio buffer
# ═══════════════════════════════════════════════════════════
def extract_clips(video_path: str, moments: list, crop_mode: str,
                  width: int, height: int, project_id: str) -> list:
    print(f"[Step 4] Extracting {len(moments)} clips...", file=sys.stderr, flush=True)

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
        ffmpeg_duration = duration + AUDIO_BUFFER

        if crop_mode in ("center", "dynamic"):
            crop_filter = f"crop={crop_w}:{crop_h}:(iw-{crop_w})/2:(ih-{crop_h})/2"
        else:
            y_offset = max(0, int((height - crop_h) * 0.35))
            x_offset = int((width - crop_w) / 2)
            crop_filter = f"crop={crop_w}:{crop_h}:{x_offset}:{y_offset}"

        try:
            subprocess.run([
                "ffmpeg", "-ss", str(start), "-i", video_path,
                "-t", f"{ffmpeg_duration:.2f}",
                "-vf", f"{crop_filter},scale=720:1280",
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
                "-threads", "1", "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart", "-y", clip_path,
            ], check=True, timeout=180)

            probe = subprocess.run([
                "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                "-of", "json", clip_path,
            ], capture_output=True, text=True, timeout=30)
            actual_dur = float(json.loads(probe.stdout)["format"]["duration"])

            clips.append({
                "id": clip_id, "index": i + 1, "path": clip_path,
                "start_time": start, "end_time": moment["end_time"],
                "duration": duration, "actual_duration": round(actual_dur, 2),
                "hook_score": moment["hook_score"], "reason": moment["reason"],
                "status": "done",
            })
            print(f"[Step 4] ✅ {clip_id}: {actual_dur:.1f}s", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"[Step 4] Error {clip_id}: {e}", file=sys.stderr, flush=True)
            clips.append({
                "id": clip_id, "index": i + 1, "path": None,
                "start_time": start, "end_time": moment["end_time"],
                "duration": duration, "actual_duration": 0,
                "hook_score": moment["hook_score"], "reason": moment["reason"],
                "status": "error",
            })

    return clips


# ═══════════════════════════════════════════════════════════
# STEP 5: Burn captions — 3 VISUALLY DISTINCT styles
#   ✅ v3: Karaoke=gold, Block=bg box, Centered=big center
# ═══════════════════════════════════════════════════════════
def add_captions(clips: list, transcript: dict, caption_style: str, project_id: str) -> list:
    if caption_style == "none":
        print("[Step 5] Skipping captions", file=sys.stderr, flush=True)
        return clips

    print(f"[Step 5] Adding '{caption_style}' captions...", file=sys.stderr, flush=True)

    out_dir = WORK_DIR / project_id / "captioned"
    out_dir.mkdir(exist_ok=True)

    for clip in clips:
        if clip["status"] != "done" or not clip.get("path"):
            continue

        clip_start = clip["start_time"]
        clip_end = clip["end_time"]
        clip_actual_dur = clip.get("actual_duration", clip["duration"])

        clip_segments = []
        for seg in transcript["segments"]:
            if seg["end"] > clip_start and seg["start"] < clip_end:
                clip_segments.append({
                    "start": max(0, seg["start"] - clip_start),
                    "end": min(clip_actual_dur, seg["end"] - clip_start),
                    "text": seg["text"],
                })

        if not clip_segments:
            continue

        srt_path = str(out_dir / f"{clip['id']}.srt")
        with open(srt_path, "w", encoding="utf-8") as f:
            for j, seg in enumerate(clip_segments):
                s, e = seg["start"], seg["end"]
                start_ts = f"{int(s//3600):02d}:{int((s%3600)//60):02d}:{int(s%60):02d},{int((s%1)*1000):03d}"
                end_ts = f"{int(e//3600):02d}:{int((e%3600)//60):02d}:{int(e%60):02d},{int((e%1)*1000):03d}"
                text = seg["text"].strip().upper()
                f.write(f"{j+1}\n{start_ts} --> {end_ts}\n{text}\n\n")

        captioned_path = str(out_dir / f"{clip['id']}_captioned.mp4")
        escaped_srt = srt_path.replace("\\", "/").replace(":", "\\:")

        # ═══════════════════════════════════════════════════
        # 3 VISUALLY DISTINCT styles (720x1280 output)
        # ═══════════════════════════════════════════════════
        if caption_style == "karaoke":
            # ★ KARAOKE: Gold/amber highlight text, no bg box, lower-center
            sub_style = (
                "Alignment=2,"
                "FontSize=22,FontName=Arial,Bold=1,"
                "PrimaryColour=&H0000D7FF,"      # Gold (BGR: FFD700 → ASS: 00D7FF)
                "SecondaryColour=&H00FFFFFF,"
                "OutlineColour=&H00000000,"
                "BackColour=&H00000000,"
                "Outline=2,Shadow=1,"
                "BorderStyle=1,"                   # Outline only, NO box
                "MarginV=190,"
                "MarginL=40,MarginR=40,"
                "Spacing=1"
            )
        elif caption_style == "centered":
            # ★ CENTERED: Large white text, screen center, heavy outline
            sub_style = (
                "Alignment=5,"                     # Center of screen
                "FontSize=26,FontName=Arial,Bold=1,"
                "PrimaryColour=&H00FFFFFF,"        # White
                "OutlineColour=&H00000000,"
                "BackColour=&H00000000,"
                "Outline=3,Shadow=2,"
                "BorderStyle=1,"                   # Outline only
                "MarginV=0,"
                "MarginL=50,MarginR=50,"
                "Spacing=2"
            )
        else:
            # ★ BLOCK: White text on semi-transparent black bg box
            sub_style = (
                "Alignment=2,"
                "FontSize=18,FontName=Arial,Bold=1,"
                "PrimaryColour=&H00FFFFFF,"        # White
                "OutlineColour=&H00000000,"
                "BackColour=&H96000000,"           # Semi-transparent black
                "Outline=1,Shadow=0,"
                "BorderStyle=3,"                   # ← BACKGROUND BOX
                "MarginV=60,"
                "MarginL=20,MarginR=20,"
                "Spacing=0"
            )

        sub_filter = f"subtitles='{escaped_srt}':force_style='{sub_style}'"

        try:
            subprocess.run([
                "ffmpeg", "-i", clip["path"],
                "-vf", sub_filter,
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
                "-threads", "1", "-c:a", "copy",
                "-y", captioned_path,
            ], check=True, timeout=180)

            old_path = clip["path"]
            clip["path"] = captioned_path
            try:
                os.remove(old_path)
            except Exception:
                pass
            print(f"[Step 5] ✅ {clip['id']} — {caption_style}", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"[Step 5] Error {clip['id']}: {e}", file=sys.stderr, flush=True)

    return clips


# ═══════════════════════════════════════════════════════════
# STEP 6: Thumbnails
# ═══════════════════════════════════════════════════════════
def generate_thumbnails(clips: list, project_id: str) -> list:
    out_dir = WORK_DIR / project_id / "thumbnails"
    out_dir.mkdir(exist_ok=True)
    for clip in clips:
        if clip["status"] != "done" or not clip.get("path"):
            continue
        thumb_path = str(out_dir / f"{clip['id']}_thumb.jpg")
        try:
            subprocess.run([
                "ffmpeg", "-ss", str(min(2.0, clip["duration"] / 3)),
                "-i", clip["path"], "-vframes", "1", "-q:v", "2", "-y", thumb_path,
            ], check=True, timeout=30)
            clip["thumb_path"] = thumb_path
        except Exception as e:
            print(f"[Step 6] Error {clip['id']}: {e}", file=sys.stderr, flush=True)
    return clips


# ═══════════════════════════════════════════════════════════
# STEP 7: Titles & descriptions
# ═══════════════════════════════════════════════════════════
def generate_titles_descriptions(clips: list, transcript: dict, source_title: str) -> list:
    clip_contexts = []
    for clip in clips:
        clip_text = ""
        for seg in transcript["segments"]:
            if seg["end"] > clip["start_time"] and seg["start"] < clip["end_time"]:
                clip_text += seg["text"] + " "
        clip_contexts.append({
            "id": clip["id"], "index": clip["index"],
            "start_time": clip["start_time"], "end_time": clip["end_time"],
            "hook_score": clip["hook_score"], "reason": clip["reason"],
            "transcript_excerpt": clip_text.strip()[:500],
        })

    prompt = f"""Generate viral YouTube Shorts titles and descriptions for clips from "{source_title or 'Unknown'}".

CLIPS:
{json.dumps(clip_contexts, indent=2)}

For each clip:
1. title — Max 60 chars. Scroll-stopping hook.
2. description — 2-3 sentences. Include #hashtags. Under 200 chars.

RESPOND WITH VALID JSON ONLY:
[{{"id": "clip-1", "title": "Title Here", "description": "Description #shorts"}}]"""

    response = openai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.8, max_tokens=3000,
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
            clip["description"] = "An amazing clip. #shorts #viral"

    return clips


# ═══════════════════════════════════════════════════════════
# STEP 8: Upload to Supabase
# ═══════════════════════════════════════════════════════════
def upload_to_storage(clips: list, project_id: str, user_id: str) -> list:
    bucket = "shorts"
    for clip in clips:
        if clip["status"] != "done" or not clip.get("path"):
            continue
        video_key = f"{user_id}/{project_id}/{clip['id']}.mp4"
        try:
            with open(clip["path"], "rb") as f:
                get_sb().storage.from_(bucket).upload(video_key, f.read(), file_options={"content-type": "video/mp4"})
            clip["video_url"] = f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{video_key}"
        except Exception as e:
            print(f"[Step 8] Upload error {clip['id']}: {e}", file=sys.stderr, flush=True)
        if clip.get("thumb_path"):
            thumb_key = f"{user_id}/{project_id}/{clip['id']}_thumb.jpg"
            try:
                with open(clip["thumb_path"], "rb") as f:
                    get_sb().storage.from_(bucket).upload(thumb_key, f.read(), file_options={"content-type": "image/jpeg"})
                clip["thumbnail_url"] = f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{thumb_key}"
            except Exception as e:
                print(f"[Step 8] Thumb error {clip['id']}: {e}", file=sys.stderr, flush=True)
    return clips


# ═══════════════════════════════════════════════════════════
# STEP 9: Finalize
# ═══════════════════════════════════════════════════════════
def finalize(project_id: str, clips: list, transcript_text: str):
    clean_clips = []
    for clip in clips:
        clean_clips.append({
            "id": clip["id"], "index": clip["index"],
            "title": clip.get("title", f"Clip #{clip['index']}"),
            "description": clip.get("description", ""),
            "start_time": clip["start_time"], "end_time": clip["end_time"],
            "duration": clip["duration"],
            "actual_duration": clip.get("actual_duration", clip["duration"]),
            "hook_score": clip["hook_score"], "reason": clip["reason"],
            "video_url": clip.get("video_url"),
            "thumbnail_url": clip.get("thumbnail_url"),
            "status": clip["status"],
        })
    get_sb().table("shorts_projects").update({
        "status": "done", "progress_pct": 100, "progress_stage": "done",
        "clips": clean_clips, "transcript": transcript_text[:50000],
    }).eq("id", project_id).execute()


def cleanup(project_id: str):
    import shutil
    project_dir = WORK_DIR / project_id
    if project_dir.exists():
        shutil.rmtree(project_dir, ignore_errors=True)


# ═══════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════
def run_pipeline(project_id, source_url):
    print(f"\n{'='*60}", file=sys.stderr, flush=True)
    print(f"[Pipeline] v3 Starting for {project_id}", file=sys.stderr, flush=True)
    print(f"{'='*60}", file=sys.stderr, flush=True)

    try:
        result = get_sb().table("shorts_projects").select("*").eq("id", project_id).single().execute()
        project = result.data
    except Exception as e:
        update_progress(project_id, 0, "error", error=f"Project not found: {e}")
        return

    user_id = project["user_id"]
    max_clips = project.get("max_clips", 5)
    clip_length = project.get("clip_length", "30-60")
    caption_style = project.get("caption_style", "karaoke")
    crop_mode = project.get("crop_mode", "face-track")
    do_thumbnails = project.get("generate_thumbnails", True)
    source_title = project.get("source_title", "")

    clip_min_sec, clip_max_sec = parse_clip_length(clip_length)
    if project.get("clip_min_seconds"):
        clip_min_sec = int(project["clip_min_seconds"])
    if project.get("clip_max_seconds"):
        clip_max_sec = int(project["clip_max_seconds"])

    print(f"[Pipeline] clips={max_clips}, dur={clip_min_sec}-{clip_max_sec}s, "
          f"captions={caption_style}, crop={crop_mode}", file=sys.stderr, flush=True)

    try:
        update_progress(project_id, 5, "downloading")
        dl = download_video(source_url, project_id)
        get_sb().table("shorts_projects").update({"source_duration_sec": int(dl["duration"])}).eq("id", project_id).execute()

        update_progress(project_id, 20, "transcribing")
        transcript = transcribe_audio(dl["audio_path"])
        try: os.remove(dl["audio_path"])
        except: pass

        update_progress(project_id, 40, "analyzing")
        moments = detect_viral_moments(transcript, max_clips, clip_length, dl["duration"], clip_min_sec, clip_max_sec)

        update_progress(project_id, 55, "clipping")
        clips = extract_clips(dl["video_path"], moments, crop_mode, dl["width"], dl["height"], project_id)
        try: os.remove(dl["video_path"])
        except: pass

        update_progress(project_id, 70, "captioning")
        clips = add_captions(clips, transcript, caption_style, project_id)

        if do_thumbnails:
            update_progress(project_id, 80, "thumbnails")
            clips = generate_thumbnails(clips, project_id)

        update_progress(project_id, 85, "analyzing")
        clips = generate_titles_descriptions(clips, transcript, source_title)

        update_progress(project_id, 90, "uploading")
        clips = upload_to_storage(clips, project_id, user_id)

        update_progress(project_id, 98, "done")
        finalize(project_id, clips, transcript["full_text"])

        print(f"\n{'='*60}", file=sys.stderr, flush=True)
        print(f"[Pipeline] ✅ COMPLETE — {len(clips)} clips:", file=sys.stderr, flush=True)
        for c in clips:
            print(f"  #{c['index']}: {c.get('actual_duration',c['duration']):.1f}s "
                  f"(score={c['hook_score']}) {c.get('title','?')}", file=sys.stderr, flush=True)
        print(f"{'='*60}\n", file=sys.stderr, flush=True)
        cleanup(project_id)

    except Exception as e:
        print(f"[Pipeline] ❌ {e}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        update_progress(project_id, 0, "error", error=str(e))
        cleanup(project_id)


# ═══════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════
@app.route("/shorts", methods=["POST"])
def shorts_endpoint():
    data = request.get_json(force=True)
    project_id = data.get("project_id")
    source_url = data.get("source_url")
    if not project_id or not source_url:
        return jsonify({"error": "project_id and source_url required"}), 400
    thread = threading.Thread(target=run_pipeline, args=(project_id, source_url))
    thread.daemon = True
    thread.start()
    return jsonify({"message": "Pipeline started", "project_id": project_id}), 200


@app.route("/health", methods=["GET"])
def health():
    node_ok, node_ver = False, "N/A"
    try:
        r = subprocess.run(["node", "--version"], capture_output=True, text=True, timeout=5)
        if r.returncode == 0: node_ok, node_ver = True, r.stdout.strip()
    except: pass
    yt_ver = "N/A"
    try:
        r = subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True, timeout=5)
        if r.returncode == 0: yt_ver = r.stdout.strip()
    except: pass
    return jsonify({
        "status": "ok", "version": "3.0.0",
        "fixes": ["complete-story-arcs", "sentence-boundary-snapping",
                   "distinct-caption-styles", "duration-enforcement", "audio-buffer"],
        "caption_styles": {
            "karaoke": "Gold highlight, no bg, lower-center",
            "block": "White on black bg box, bottom",
            "centered": "Large white, screen center, heavy outline",
        },
        "node": node_ver, "ytdlp": yt_ver,
    }), 200


@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "ok", "version": "3.0.0", "endpoints": ["/shorts", "/health"]}), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    print(f"[startup] Shorts Worker v3.0 on port {port}", file=sys.stderr, flush=True)
    app.run(host="0.0.0.0", port=port, debug=False)

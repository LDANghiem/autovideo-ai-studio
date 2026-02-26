"""
============================================================
FILE: worker/app.py  (v4 — CAPTION SIZE + AUDIO CUTOFF + CONTENT)
============================================================
FIXES v4:
  FIX 1: Captions too big/cut off → FontSize 22→14, margins 40→80
  FIX 2: Audio/last word cut off → AUDIO_BUFFER 0.5→1.5s + sentence completion
  FIX 3: Content not convincing → verify clips end on complete sentences (.!?)
============================================================
"""

import os, sys, json, uuid, math, subprocess, tempfile, traceback, threading, base64
from pathlib import Path
from flask import Flask, request, jsonify
from dotenv import load_dotenv
load_dotenv()

from supabase import create_client as _create_sb_client
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
_sb_client = None

def get_sb():
    global _sb_client
    if _sb_client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError("Missing Supabase config")
        print(f"[init] Supabase: {SUPABASE_URL[:30]}...", file=sys.stderr, flush=True)
        _sb_client = _create_sb_client(SUPABASE_URL, SUPABASE_KEY)
    return _sb_client

from openai import OpenAI
openai = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

app = Flask(__name__)
WORK_DIR = Path(tempfile.gettempdir()) / "shorts_worker"
WORK_DIR.mkdir(exist_ok=True)

# v4: Increased from 0.5 → 1.5s
AUDIO_BUFFER = 1.5

COOKIES_PATH = str(WORK_DIR / "cookies.txt")
_yt_cookies_b64 = os.environ.get("YT_COOKIES_BASE64", "")
if _yt_cookies_b64:
    try:
        cb = base64.b64decode(_yt_cookies_b64)
        with open(COOKIES_PATH, "wb") as f: f.write(cb)
        print(f"[init] Cookies loaded ({len(cb)}b)", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"[init] Cookie error: {e}", file=sys.stderr, flush=True)
        COOKIES_PATH = None
else:
    COOKIES_PATH = None


# ═══════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════
def parse_clip_length(cl):
    try:
        p = str(cl).split("-")
        if len(p)==2:
            lo,hi = int(p[0].strip()), int(p[1].strip())
            if lo>0 and hi>0 and hi>=lo: return (lo,hi)
    except: pass
    return (30,60)

def update_progress(pid, pct, stage, clips=None, error=None):
    d = {"progress_pct": pct, "progress_stage": stage}
    if clips is not None: d["clips"] = clips
    if error: d["status"] = "error"; d["error_message"] = error
    try: get_sb().table("shorts_projects").update(d).eq("id", pid).execute()
    except Exception as e: print(f"[progress] {e}", file=sys.stderr, flush=True)

def snap_to_segment_boundary(tv, segments, mode="nearest"):
    if not segments: return tv
    best, best_d = tv, float("inf")
    for seg in segments:
        if mode == "start":
            d = abs(seg["start"] - tv)
            if d < best_d: best_d, best = d, seg["start"]
        elif mode == "end":
            d = abs(seg["end"] - tv)
            if d < best_d: best_d, best = d, seg["end"]
        else:
            for b in [seg["start"], seg["end"]]:
                d = abs(b - tv)
                if d < best_d: best_d, best = d, b
    return best

def ensure_complete_sentence(start, end, segments, video_dur, clip_max):
    """v4: Extend clip end to include the full last sentence (must end with .!?)"""
    overlapping = [s for s in segments if s["end"] > start and s["start"] < end]
    if not overlapping: return end

    last_seg = overlapping[-1]
    last_text = last_seg["text"].strip()
    if last_text and last_text[-1] in ".!?\"'":
        return min(video_dur, last_seg["end"] + 0.5)

    # Find next segment that ends a sentence
    seg_idx = None
    for i, s in enumerate(segments):
        if s["start"] >= last_seg["start"] and s["end"] >= last_seg["end"]:
            seg_idx = i; break

    if seg_idx is not None:
        for j in range(seg_idx + 1, min(seg_idx + 5, len(segments))):
            cand = segments[j]
            ct = cand["text"].strip()
            new_end = cand["end"] + 0.5
            if new_end - start > clip_max + 8: break
            if ct and ct[-1] in ".!?\"'":
                print(f"    → Sentence extended +{new_end-end:.1f}s", file=sys.stderr, flush=True)
                return min(video_dur, new_end)

    return min(video_dur, last_seg["end"] + 1.0)


# ═══════════════════════════════════════════════════════════
# STEP 1: Download
# ═══════════════════════════════════════════════════════════
def download_video(source_url, project_id):
    print(f"[Step 1] Downloading: {source_url}", file=sys.stderr, flush=True)
    out_dir = WORK_DIR / project_id; out_dir.mkdir(exist_ok=True)
    vp = str(out_dir / "source.mp4"); ap = str(out_dir / "audio.mp3")
    raw = str(out_dir / "source.%(ext)s")

    try:
        v = subprocess.run(["yt-dlp","--version"], capture_output=True, text=True, timeout=10)
        n = subprocess.run(["node","--version"], capture_output=True, text=True, timeout=10)
        print(f"[Step 1] yt-dlp={v.stdout.strip()}, node={n.stdout.strip()}", file=sys.stderr, flush=True)
    except: pass

    base = ["yt-dlp","--js-runtimes","node",
        "-f","bv[vcodec^=avc1][height<=720]+ba[acodec^=mp4a]/bv[vcodec^=avc1][height<=720]+ba/bv*[height<=720]+ba/b",
        "--merge-output-format","mp4","-o",raw,"--no-playlist","--no-check-certificates",
        "--user-agent","Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"]
    if COOKIES_PATH and os.path.exists(COOKIES_PATH):
        base.extend(["--cookies", COOKIES_PATH])

    strats = [
        {"l":"Default","a":[]},
        {"l":"TV embedded","a":["--extractor-args","youtube:player_client=tv_embedded"]},
        {"l":"Web","a":["--extractor-args","youtube:player_client=web"]},
    ]
    ok = False
    for i,s in enumerate(strats):
        try:
            subprocess.run(base+s["a"]+[source_url], check=True, capture_output=True, text=True, timeout=600)
            ok = True; print(f"[Step 1] ✅ {s['l']}", file=sys.stderr, flush=True); break
        except subprocess.CalledProcessError as e:
            print(f"[Step 1] {s['l']} failed: {(e.stderr or '')[:200]}", file=sys.stderr, flush=True)
            for p in out_dir.glob("source.*"):
                if p.suffix != ".mp3": p.unlink(missing_ok=True)
    if not ok: raise RuntimeError("All download strategies failed.")

    df = None
    for f in out_dir.glob("source.*"):
        if f.suffix not in (".mp3",".part"): df = str(f); break
    if not df: raise RuntimeError("No file after download.")

    if not df.endswith(".mp4"):
        subprocess.run(["ffmpeg","-i",df,"-c:v","libx264","-preset","ultrafast","-crf","28",
            "-vf","scale=-2:720","-c:a","aac","-b:a","128k","-threads","1",
            "-movflags","+faststart","-y",vp], check=True, timeout=600)
        os.remove(df)
    elif df != vp: os.rename(df, vp)

    subprocess.run(["ffmpeg","-i",vp,"-vn","-acodec","libmp3lame","-ar","16000","-ac","1","-y",ap],
        check=True, timeout=120)

    r = subprocess.run(["ffprobe","-v","quiet","-show_entries","format=duration","-of","json",vp],
        capture_output=True, text=True, timeout=30)
    dur = float(json.loads(r.stdout)["format"]["duration"])

    r = subprocess.run(["ffprobe","-v","quiet","-show_entries","stream=width,height","-of","json",
        "-select_streams","v:0",vp], capture_output=True, text=True, timeout=30)
    st = json.loads(r.stdout).get("streams",[{}])
    w = st[0].get("width",1920) if st else 1920
    h = st[0].get("height",1080) if st else 1080
    return {"video_path":vp,"audio_path":ap,"duration":dur,"width":w,"height":h}


# ═══════════════════════════════════════════════════════════
# STEP 2: Transcribe
# ═══════════════════════════════════════════════════════════
def transcribe_audio(audio_path):
    print("[Step 2] Transcribing...", file=sys.stderr, flush=True)
    if os.path.getsize(audio_path) > 25*1024*1024:
        return transcribe_large_audio(audio_path)
    with open(audio_path,"rb") as f:
        resp = openai.audio.transcriptions.create(model="whisper-1",file=f,
            response_format="verbose_json",timestamp_granularities=["segment"])
    segs = []
    if hasattr(resp,"segments") and resp.segments:
        for s in resp.segments:
            segs.append({"start":s.get("start",0),"end":s.get("end",0),"text":s.get("text","").strip()})
    return {"full_text":resp.text if hasattr(resp,"text") else "","segments":segs}

def transcribe_large_audio(audio_path):
    cd = Path(audio_path).parent / "audio_chunks"; cd.mkdir(exist_ok=True)
    subprocess.run(["ffmpeg","-i",audio_path,"-f","segment","-segment_time","600",
        "-c","copy","-y",str(cd/"chunk_%03d.mp3")], check=True, timeout=120)
    segs,txts,off = [],[],0.0
    for cf in sorted(cd.glob("chunk_*.mp3")):
        with open(str(cf),"rb") as f:
            resp = openai.audio.transcriptions.create(model="whisper-1",file=f,
                response_format="verbose_json",timestamp_granularities=["segment"])
        if hasattr(resp,"segments") and resp.segments:
            for s in resp.segments:
                segs.append({"start":s.get("start",0)+off,"end":s.get("end",0)+off,"text":s.get("text","").strip()})
        txts.append(resp.text if hasattr(resp,"text") else "")
        r = subprocess.run(["ffprobe","-v","quiet","-show_entries","format=duration","-of","json",str(cf)],
            capture_output=True,text=True,timeout=30)
        off += float(json.loads(r.stdout)["format"]["duration"])
    return {"full_text":" ".join(txts),"segments":segs}


# ═══════════════════════════════════════════════════════════
# STEP 3: Viral moment detection + sentence completion
# ═══════════════════════════════════════════════════════════
def detect_viral_moments(transcript, max_clips, clip_length, video_dur, clip_min, clip_max):
    print(f"[Step 3] Finding {max_clips} moments ({clip_min}-{clip_max}s)...", file=sys.stderr, flush=True)
    segments = transcript["segments"]
    seg_text = ""
    for seg in segments:
        m,s = int(seg["start"]//60), int(seg["start"]%60)
        seg_text += f"[{m}:{s:02d} / {seg['start']:.1f}s] {seg['text']}\n"

    prompt = f"""You are a world-class viral content editor for YouTube Shorts, TikTok, and Reels.

VIDEO DURATION: {video_dur:.0f} seconds

TRANSCRIPT:
{seg_text}

Find exactly {max_clips} clips, each {clip_min}-{clip_max} seconds.

CRITICAL RULE — COMPLETE STORY ARC:
Every clip MUST have:
1. HOOK (first 3s) — Surprising/provocative opening that stops scrolling
2. DEVELOPMENT (middle) — Story, explanation, build-up
3. PAYOFF (final seconds) — Satisfying conclusion, punchline, or lesson

THE LAST SENTENCE MUST FEEL FINAL:
✅ "...and that changed everything."
✅ "...that's the real secret most people miss."
✅ Complete story with clear moral
❌ "...and the reason is—" (cuts off)
❌ "...so what you need to—" (incomplete)
❌ Speaker still building to conclusion

RULES:
- end_time - start_time = {clip_min}-{clip_max} seconds (OK to go +5s for complete thought)
- Start 2s before hook, end 2s after conclusion
- No overlap. Spread across video.
- Score 70+ only. Below 70 = don't include.

JSON ONLY:
[{{"start_time":45.0,"end_time":78.5,"hook_score":95,"reason":"Why viral"}}]"""

    resp = openai.chat.completions.create(model="gpt-4o",
        messages=[{"role":"user","content":prompt}], temperature=0.7, max_tokens=4000)
    content = resp.choices[0].message.content.strip()
    if content.startswith("```"): content = content.split("\n",1)[1] if "\n" in content else content[3:]
    if content.endswith("```"): content = content[:-3]
    moments = json.loads(content.strip())

    validated = []
    for i, m in enumerate(moments[:max_clips]):
        rs = max(0, float(m.get("start_time",0)))
        re = min(video_dur, float(m.get("end_time", rs+clip_min)))
        print(f"  #{i+1}: GPT={rs:.1f}-{re:.1f}s ({re-rs:.0f}s)", file=sys.stderr, flush=True)

        start = snap_to_segment_boundary(rs, segments, "start")
        end = snap_to_segment_boundary(re, segments, "end")
        start = max(0, start - 2.0)
        end = min(video_dur, end + 1.0)

        # v4: Ensure complete sentence
        end = ensure_complete_sentence(start, end, segments, video_dur, clip_max)
        dur = end - start

        if dur < clip_min:
            end = min(video_dur, end + (clip_min - dur))
            dur = end - start
            if dur < clip_min:
                start = max(0, start - (clip_min - dur))
                dur = end - start
            end = ensure_complete_sentence(start, end, segments, video_dur, clip_max)
            dur = end - start
            if dur < clip_min: end = min(video_dur, start + clip_min); dur = end - start
            print(f"    → Extended to {dur:.0f}s", file=sys.stderr, flush=True)

        if dur > clip_max + 5:
            end = start + clip_max
            sn = snap_to_segment_boundary(end, segments, "end")
            end = sn if sn <= start + clip_max + 5 else start + clip_max
            dur = end - start
            print(f"    → Trimmed to {dur:.0f}s", file=sys.stderr, flush=True)

        start, end = max(0,start), min(video_dur,end)
        dur = end - start

        validated.append({
            "start_time": round(start,2), "end_time": round(end,2),
            "duration": round(dur,2),
            "hook_score": min(100, max(1, int(m.get("hook_score",50)))),
            "reason": m.get("reason", "Engaging"),
        })

    validated.sort(key=lambda x: x["hook_score"], reverse=True)
    print(f"[Step 3] ✅ {len(validated)} clips:", file=sys.stderr, flush=True)
    for v in validated:
        cs = [s for s in segments if s["end"]>v["start_time"] and s["start"]<v["end_time"]]
        lw = cs[-1]["text"].strip()[-50:] if cs else "?"
        print(f"  → {v['duration']:.0f}s (score={v['hook_score']}) ends: \"...{lw}\"",
              file=sys.stderr, flush=True)
    return validated


# ═══════════════════════════════════════════════════════════
# STEP 4: Extract + crop
# ═══════════════════════════════════════════════════════════
def extract_clips(video_path, moments, crop_mode, width, height, project_id):
    print(f"[Step 4] Extracting {len(moments)} clips (buf={AUDIO_BUFFER}s)...", file=sys.stderr, flush=True)
    od = WORK_DIR / project_id / "clips"; od.mkdir(exist_ok=True)
    ratio = 9/16
    if width/height > ratio: ch,cw = height, int(height*ratio)
    else: cw,ch = width, int(width/ratio)

    clips = []
    for i, mom in enumerate(moments):
        cid = f"clip-{i+1}"; cp = str(od/f"{cid}.mp4")
        s, d = mom["start_time"], mom["duration"]
        fd = d + AUDIO_BUFFER

        if crop_mode in ("center","dynamic"):
            cf = f"crop={cw}:{ch}:(iw-{cw})/2:(ih-{ch})/2"
        else:
            yo = max(0,int((height-ch)*0.35)); xo = int((width-cw)/2)
            cf = f"crop={cw}:{ch}:{xo}:{yo}"

        try:
            subprocess.run(["ffmpeg","-ss",str(s),"-i",video_path,"-t",f"{fd:.2f}",
                "-vf",f"{cf},scale=720:1280","-c:v","libx264","-preset","ultrafast",
                "-crf","28","-threads","1","-c:a","aac","-b:a","128k",
                "-movflags","+faststart","-y",cp], check=True, timeout=180)
            pr = subprocess.run(["ffprobe","-v","quiet","-show_entries","format=duration",
                "-of","json",cp], capture_output=True, text=True, timeout=30)
            ad = float(json.loads(pr.stdout)["format"]["duration"])
            clips.append({"id":cid,"index":i+1,"path":cp,"start_time":s,"end_time":mom["end_time"],
                "duration":d,"actual_duration":round(ad,2),"hook_score":mom["hook_score"],
                "reason":mom["reason"],"status":"done"})
            print(f"[Step 4] ✅ {cid}: {ad:.1f}s", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"[Step 4] ❌ {cid}: {e}", file=sys.stderr, flush=True)
            clips.append({"id":cid,"index":i+1,"path":None,"start_time":s,"end_time":mom["end_time"],
                "duration":d,"actual_duration":0,"hook_score":mom["hook_score"],
                "reason":mom["reason"],"status":"error"})
    return clips


# ═══════════════════════════════════════════════════════════
# STEP 5: Captions — v4: SMALLER fonts, wider margins
# ═══════════════════════════════════════════════════════════
def add_captions(clips, transcript, caption_style, project_id):
    if caption_style == "none":
        return clips
    print(f"[Step 5] '{caption_style}' captions (v4: smaller)...", file=sys.stderr, flush=True)
    od = WORK_DIR / project_id / "captioned"; od.mkdir(exist_ok=True)

    for clip in clips:
        if clip["status"] != "done" or not clip.get("path"): continue
        cs, ce = clip["start_time"], clip["end_time"]
        cad = clip.get("actual_duration", clip["duration"])

        csegs = []
        for seg in transcript["segments"]:
            if seg["end"] > cs and seg["start"] < ce + AUDIO_BUFFER:
                csegs.append({"start":max(0,seg["start"]-cs),
                    "end":min(cad, seg["end"]-cs), "text":seg["text"]})
        if not csegs: continue

        sp = str(od / f"{clip['id']}.srt")
        with open(sp,"w",encoding="utf-8") as f:
            for j,seg in enumerate(csegs):
                s,e = seg["start"],seg["end"]
                st = f"{int(s//3600):02d}:{int((s%3600)//60):02d}:{int(s%60):02d},{int((s%1)*1000):03d}"
                et = f"{int(e//3600):02d}:{int((e%3600)//60):02d}:{int(e%60):02d},{int((e%1)*1000):03d}"
                f.write(f"{j+1}\n{st} --> {et}\n{seg['text'].strip().upper()}\n\n")

        cp2 = str(od / f"{clip['id']}_captioned.mp4")
        esp = sp.replace("\\","/").replace(":","\\:")

        # v4: SMALLER fonts + WIDER margins = text fits on screen
        # 720x1280 output
        if caption_style == "karaoke":
            ss = ("Alignment=2,FontSize=14,FontName=Arial,Bold=1,"
                  "PrimaryColour=&H0000D7FF,SecondaryColour=&H00FFFFFF,"
                  "OutlineColour=&H00000000,BackColour=&H00000000,"
                  "Outline=2,Shadow=1,BorderStyle=1,"
                  "MarginV=140,MarginL=80,MarginR=80,Spacing=1")
        elif caption_style == "centered":
            ss = ("Alignment=5,FontSize=16,FontName=Arial,Bold=1,"
                  "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
                  "BackColour=&H00000000,Outline=3,Shadow=2,BorderStyle=1,"
                  "MarginV=0,MarginL=80,MarginR=80,Spacing=1")
        else:  # block
            ss = ("Alignment=2,FontSize=13,FontName=Arial,Bold=1,"
                  "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
                  "BackColour=&H96000000,Outline=1,Shadow=0,BorderStyle=3,"
                  "MarginV=50,MarginL=30,MarginR=30,Spacing=0")

        sf = f"subtitles='{esp}':force_style='{ss}'"
        try:
            subprocess.run(["ffmpeg","-i",clip["path"],"-vf",sf,"-c:v","libx264",
                "-preset","ultrafast","-crf","28","-threads","1","-c:a","copy",
                "-y",cp2], check=True, timeout=180)
            old = clip["path"]; clip["path"] = cp2
            try: os.remove(old)
            except: pass
            print(f"[Step 5] ✅ {clip['id']}", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"[Step 5] ❌ {clip['id']}: {e}", file=sys.stderr, flush=True)
    return clips


# ═══════════════════════════════════════════════════════════
# STEPS 6-9
# ═══════════════════════════════════════════════════════════
def generate_thumbnails(clips, project_id):
    od = WORK_DIR / project_id / "thumbnails"; od.mkdir(exist_ok=True)
    for c in clips:
        if c["status"]!="done" or not c.get("path"): continue
        tp = str(od/f"{c['id']}_thumb.jpg")
        try:
            subprocess.run(["ffmpeg","-ss",str(min(2.0,c["duration"]/3)),"-i",c["path"],
                "-vframes","1","-q:v","2","-y",tp], check=True, timeout=30)
            c["thumb_path"] = tp
        except: pass
    return clips

def generate_titles_descriptions(clips, transcript, source_title):
    ctx = []
    for c in clips:
        t = ""
        for s in transcript["segments"]:
            if s["end"]>c["start_time"] and s["start"]<c["end_time"]: t += s["text"]+" "
        ctx.append({"id":c["id"],"index":c["index"],"start_time":c["start_time"],
            "end_time":c["end_time"],"hook_score":c["hook_score"],"reason":c["reason"],
            "transcript_excerpt":t.strip()[:500]})

    prompt = f"""Generate viral YouTube Shorts titles/descriptions for clips from "{source_title or 'Unknown'}".
CLIPS: {json.dumps(ctx,indent=2)}
Per clip: 1. title (max 60 chars, scroll-stopping) 2. description (2-3 sentences + #hashtags, <200 chars)
JSON ONLY: [{{"id":"clip-1","title":"Title","description":"Desc #shorts"}}]"""

    resp = openai.chat.completions.create(model="gpt-4o",
        messages=[{"role":"user","content":prompt}], temperature=0.8, max_tokens=3000)
    content = resp.choices[0].message.content.strip()
    if content.startswith("```"): content = content.split("\n",1)[1] if "\n" in content else content[3:]
    if content.endswith("```"): content = content[:-3]
    td = json.loads(content.strip())
    tm = {t["id"]:t for t in td}
    for c in clips:
        if c["id"] in tm:
            c["title"] = tm[c["id"]].get("title",f"Moment #{c['index']}")
            c["description"] = tm[c["id"]].get("description","")
        else: c["title"]=f"Moment #{c['index']}"; c["description"]="#shorts"
    return clips

def upload_to_storage(clips, project_id, user_id):
    bk = "shorts"
    for c in clips:
        if c["status"]!="done" or not c.get("path"): continue
        vk = f"{user_id}/{project_id}/{c['id']}.mp4"
        try:
            with open(c["path"],"rb") as f:
                get_sb().storage.from_(bk).upload(vk,f.read(),file_options={"content-type":"video/mp4"})
            c["video_url"] = f"{SUPABASE_URL}/storage/v1/object/public/{bk}/{vk}"
        except Exception as e: print(f"[Step 8] ❌ {c['id']}: {e}", file=sys.stderr, flush=True)
        if c.get("thumb_path"):
            tk = f"{user_id}/{project_id}/{c['id']}_thumb.jpg"
            try:
                with open(c["thumb_path"],"rb") as f:
                    get_sb().storage.from_(bk).upload(tk,f.read(),file_options={"content-type":"image/jpeg"})
                c["thumbnail_url"] = f"{SUPABASE_URL}/storage/v1/object/public/{bk}/{tk}"
            except: pass
    return clips

def finalize(pid, clips, txt):
    cl = []
    for c in clips:
        cl.append({"id":c["id"],"index":c["index"],"title":c.get("title",f"Clip #{c['index']}"),
            "description":c.get("description",""),"start_time":c["start_time"],"end_time":c["end_time"],
            "duration":c["duration"],"actual_duration":c.get("actual_duration",c["duration"]),
            "hook_score":c["hook_score"],"reason":c["reason"],
            "video_url":c.get("video_url"),"thumbnail_url":c.get("thumbnail_url"),"status":c["status"]})
    get_sb().table("shorts_projects").update({"status":"done","progress_pct":100,"progress_stage":"done",
        "clips":cl,"transcript":txt[:50000]}).eq("id",pid).execute()

def cleanup(pid):
    import shutil
    d = WORK_DIR / pid
    if d.exists(): shutil.rmtree(d, ignore_errors=True)


# ═══════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════
def run_pipeline(pid, url):
    print(f"\n{'='*60}\n[Pipeline] v4 — {pid}\n{'='*60}", file=sys.stderr, flush=True)
    try:
        r = get_sb().table("shorts_projects").select("*").eq("id",pid).single().execute()
        proj = r.data
    except Exception as e:
        update_progress(pid,0,"error",error=f"Not found: {e}"); return

    uid = proj["user_id"]
    mc = proj.get("max_clips",5)
    cl = proj.get("clip_length","30-60")
    cs = proj.get("caption_style","karaoke")
    cm = proj.get("crop_mode","face-track")
    dt = proj.get("generate_thumbnails",True)
    st = proj.get("source_title","")
    cmin,cmax = parse_clip_length(cl)
    if proj.get("clip_min_seconds"): cmin = int(proj["clip_min_seconds"])
    if proj.get("clip_max_seconds"): cmax = int(proj["clip_max_seconds"])

    print(f"[Pipeline] clips={mc}, dur={cmin}-{cmax}s, captions={cs}, buf={AUDIO_BUFFER}s",
          file=sys.stderr, flush=True)

    try:
        update_progress(pid,5,"downloading")
        dl = download_video(url, pid)
        get_sb().table("shorts_projects").update({"source_duration_sec":int(dl["duration"])}).eq("id",pid).execute()

        update_progress(pid,20,"transcribing")
        tr = transcribe_audio(dl["audio_path"])
        print(f"[Pipeline] {len(tr['segments'])} segments", file=sys.stderr, flush=True)
        try: os.remove(dl["audio_path"])
        except: pass

        update_progress(pid,40,"analyzing")
        moms = detect_viral_moments(tr, mc, cl, dl["duration"], cmin, cmax)

        update_progress(pid,55,"clipping")
        clips = extract_clips(dl["video_path"], moms, cm, dl["width"], dl["height"], pid)
        try: os.remove(dl["video_path"])
        except: pass

        update_progress(pid,70,"captioning")
        clips = add_captions(clips, tr, cs, pid)

        if dt:
            update_progress(pid,80,"thumbnails")
            clips = generate_thumbnails(clips, pid)

        update_progress(pid,85,"analyzing")
        clips = generate_titles_descriptions(clips, tr, st)

        update_progress(pid,90,"uploading")
        clips = upload_to_storage(clips, pid, uid)

        update_progress(pid,98,"done")
        finalize(pid, clips, tr["full_text"])

        print(f"\n{'='*60}\n[Pipeline] ✅ {len(clips)} clips:", file=sys.stderr, flush=True)
        for c in clips:
            print(f"  #{c['index']}: {c.get('actual_duration',c['duration']):.1f}s "
                  f"(score={c['hook_score']}) {c.get('title','?')}", file=sys.stderr, flush=True)
        print(f"{'='*60}\n", file=sys.stderr, flush=True)
        cleanup(pid)
    except Exception as e:
        print(f"[Pipeline] ❌ {e}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        update_progress(pid,0,"error",error=str(e))
        cleanup(pid)


@app.route("/shorts", methods=["POST"])
def shorts_endpoint():
    d = request.get_json(force=True)
    pid,url = d.get("project_id"),d.get("source_url")
    if not pid or not url: return jsonify({"error":"project_id and source_url required"}),400
    threading.Thread(target=run_pipeline,args=(pid,url),daemon=True).start()
    return jsonify({"message":"Started","project_id":pid}),200

@app.route("/health", methods=["GET"])
def health():
    nv,yv = "N/A","N/A"
    try:
        r = subprocess.run(["node","--version"],capture_output=True,text=True,timeout=5)
        if r.returncode==0: nv=r.stdout.strip()
    except: pass
    try:
        r = subprocess.run(["yt-dlp","--version"],capture_output=True,text=True,timeout=5)
        if r.returncode==0: yv=r.stdout.strip()
    except: pass
    return jsonify({"status":"ok","version":"4.0.0",
        "fixes":["v4:smaller-captions","v4:1.5s-buffer","v4:sentence-completion"],
        "audio_buffer":AUDIO_BUFFER,"node":nv,"ytdlp":yv}),200

@app.route("/", methods=["GET"])
def root():
    return jsonify({"status":"ok","version":"4.0.0"}),200

if __name__ == "__main__":
    port = int(os.environ.get("PORT",10000))
    print(f"[startup] v4.0 on port {port}", file=sys.stderr, flush=True)
    app.run(host="0.0.0.0", port=port, debug=False)

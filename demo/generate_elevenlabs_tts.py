"""Generate Korean trailer narration without storing an API key.

Set ELEVENLABS_API_KEY only for the process that runs this script. The key is
read from the environment, never printed, and never written to disk.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path


HERE = Path(__file__).resolve().parent
DEFAULT_FFMPEG = Path(
    "C:/Users/tlseh/AppData/Local/Temp/eight-second-demo-tools/"
    "node_modules/ffmpeg-static/ffmpeg.exe"
)


def synthesize(api_key: str, voice_id: str, text: str) -> bytes:
    url = (
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        "?output_format=mp3_44100_128"
    )
    payload = json.dumps(
        {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.48,
                "similarity_boost": 0.78,
                "style": 0.35,
                "use_speaker_boost": True,
            },
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "xi-api-key": api_key,
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
        },
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 3:
                detail = error.read().decode("utf-8", errors="replace")
                raise RuntimeError(
                    f"ElevenLabs request failed ({error.code}): {detail}"
                ) from error
            time.sleep(2 ** attempt)
    raise RuntimeError("ElevenLabs request failed after retries")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--voice-id",
        default="cgSgspJ2msm6clMCkdW9",
        help="ElevenLabs voice ID (default: Jessica premade voice)",
    )
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--only",
        default="",
        help="Comma-separated clip stems to generate, for example 06-00,06-03",
    )
    args = parser.parse_args()

    api_key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("ELEVENLABS_API_KEY is required")

    ffmpeg = Path(os.environ.get("FFMPEG_PATH", str(DEFAULT_FFMPEG)))
    if not ffmpeg.exists():
        raise SystemExit(f"ffmpeg not found: {ffmpeg}")

    scenes = json.loads((HERE / "narration.json").read_text(encoding="utf-8"))
    output = HERE / ".work" / "tts"
    encoded = HERE / ".work" / "tts-elevenlabs"
    output.mkdir(parents=True, exist_ok=True)
    encoded.mkdir(parents=True, exist_ok=True)

    clips = [
        (scene_index, caption_index, caption)
        for scene_index, scene in enumerate(scenes)
        for caption_index, caption in enumerate(scene["captions"])
    ]
    selected = {stem.strip() for stem in args.only.split(",") if stem.strip()}
    if selected:
        clips = [
            clip for clip in clips
            if f"{clip[0]:02d}-{clip[1]:02d}" in selected
        ]
        if not clips:
            raise SystemExit("No matching clips were selected")
    print(f"Generating {len(clips)} clips ({sum(len(x[2]) for x in clips)} chars)")

    for sequence, (scene_index, caption_index, caption) in enumerate(clips, 1):
        stem = f"{scene_index:02d}-{caption_index:02d}"
        mp3_path = encoded / f"{stem}.mp3"
        wav_path = output / f"{stem}.wav"
        if args.force or not mp3_path.exists():
            mp3_path.write_bytes(synthesize(api_key, args.voice_id, caption))
        if args.force or not wav_path.exists() or wav_path.stat().st_mtime < mp3_path.stat().st_mtime:
            subprocess.run(
                [
                    str(ffmpeg),
                    "-y",
                    "-loglevel",
                    "error",
                    "-i",
                    str(mp3_path),
                    "-ac",
                    "1",
                    "-ar",
                    "48000",
                    "-c:a",
                    "pcm_s16le",
                    str(wav_path),
                ],
                check=True,
            )
        print(f"[{sequence:02d}/{len(clips)}] {stem}")

    print("ElevenLabs narration ready")


if __name__ == "__main__":
    main()

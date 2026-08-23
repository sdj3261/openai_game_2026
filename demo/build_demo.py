"""Build the 8 Second Crew judging trailer from real game captures.

Only deterministic local generation is used: Pillow for graphics, NumPy/wave
for the original chiptune and SFX, prepared Korean narration clips, and ffmpeg
for H.264/AAC encoding.
"""

from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import sys
import wave
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


HERE = Path(__file__).resolve().parent
WORK = HERE / ".work"
CAPTURES = WORK / "captures"
TTS = WORK / "tts"
WIDTH, HEIGHT = 1280, 720
FPS = 12
SAMPLE_RATE = 48_000
CAPTION_GAP = 0.38
SCENE_GAP = 0.82
START_PAD = 1.15
END_PAD = 2.25


@lru_cache(maxsize=64)
def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/malgunbd.ttf" if bold else "C:/Windows/Fonts/malgun.ttf"),
        Path("C:/Windows/Fonts/NanumGothicBold.ttf" if bold else "C:/Windows/Fonts/NanumGothic.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


FONT_SMALL = font(18, True)
FONT_BODY = font(26, False)
FONT_CAPTION = font(30, True)
FONT_ACCENT = font(24, True)
FONT_TITLE = font(58, True)
FONT_HUGE = font(104, True)


def read_pcm(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        rate = wav.getframerate()
        width = wav.getsampwidth()
        raw = wav.readframes(wav.getnframes())
    if width != 2:
        raise ValueError(f"16-bit PCM이 아닙니다: {path}")
    samples = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    if rate != SAMPLE_RATE:
        old_x = np.arange(len(samples), dtype=np.float64)
        new_len = int(round(len(samples) * SAMPLE_RATE / rate))
        new_x = np.linspace(0, max(0, len(samples) - 1), new_len)
        samples = np.interp(new_x, old_x, samples).astype(np.float32)
    return samples


def srt_time(seconds: float) -> str:
    millis = max(0, round(seconds * 1000))
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    secs, millis = divmod(millis, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def build_timeline(scenes: list[dict]) -> tuple[list[dict], list[dict], float, np.ndarray]:
    schedule: list[dict] = []
    spans: list[dict] = []
    clips: list[tuple[int, np.ndarray]] = []
    cursor = START_PAD
    for scene_index, scene in enumerate(scenes):
        scene_start = cursor
        for caption_index, caption in enumerate(scene["captions"]):
            clip_path = TTS / f"{scene_index:02d}-{caption_index:02d}.wav"
            if not clip_path.exists():
                raise FileNotFoundError(f"TTS 클립이 없습니다: {clip_path}")
            clip = read_pcm(clip_path)
            start = cursor
            end = start + len(clip) / SAMPLE_RATE
            schedule.append(
                {
                    "scene": scene_index,
                    "caption": caption_index,
                    "start": start,
                    "end": end,
                    "text": caption,
                }
            )
            clips.append((round(start * SAMPLE_RATE), clip))
            cursor = end + CAPTION_GAP
        scene_end = cursor + SCENE_GAP
        spans.append({"start": scene_start, "end": scene_end, "scene": scene_index})
        cursor = scene_end
    total = cursor + END_PAD
    voice = np.zeros(math.ceil(total * SAMPLE_RATE), dtype=np.float32)
    for offset, clip in clips:
        stop = min(len(voice), offset + len(clip))
        voice[offset:stop] += clip[: stop - offset]
    return schedule, spans, total, voice


def add_tone(track: np.ndarray, start: float, duration: float, frequency: float, volume: float, kind: str = "pulse") -> None:
    left = max(0, int(start * SAMPLE_RATE))
    count = min(len(track) - left, max(0, int(duration * SAMPLE_RATE)))
    if count <= 0:
        return
    t = np.arange(count, dtype=np.float32) / SAMPLE_RATE
    phase = 2 * np.pi * frequency * t
    if kind == "pulse":
        tone = np.sign(np.sin(phase)) * 0.72 + np.sin(phase) * 0.28
    elif kind == "triangle":
        tone = (2 / np.pi) * np.arcsin(np.sin(phase))
    else:
        tone = np.sin(phase)
    attack = np.minimum(1.0, t / 0.012)
    release = np.minimum(1.0, np.maximum(0.0, duration - t) / 0.08)
    env = attack * release * np.exp(-1.8 * t / max(duration, 0.01))
    track[left : left + count] += (tone * env * volume).astype(np.float32)


def add_kick(track: np.ndarray, start: float, volume: float = 0.38) -> None:
    duration = 0.15
    left = int(start * SAMPLE_RATE)
    count = min(len(track) - left, int(duration * SAMPLE_RATE))
    if count <= 0:
        return
    t = np.arange(count, dtype=np.float32) / SAMPLE_RATE
    phase = 2 * np.pi * (95 * t - 180 * t * t)
    env = np.exp(-28 * t)
    track[left : left + count] += (np.sin(phase) * env * volume).astype(np.float32)


def add_hat(track: np.ndarray, start: float, rng: np.random.Generator, volume: float = 0.075) -> None:
    duration = 0.055
    left = int(start * SAMPLE_RATE)
    count = min(len(track) - left, int(duration * SAMPLE_RATE))
    if count <= 0:
        return
    t = np.arange(count, dtype=np.float32) / SAMPLE_RATE
    noise = rng.standard_normal(count).astype(np.float32)
    env = np.exp(-70 * t)
    track[left : left + count] += noise * env * volume


def add_transition(track: np.ndarray, start: float) -> None:
    duration = 0.42
    left = int(start * SAMPLE_RATE)
    count = min(len(track) - left, int(duration * SAMPLE_RATE))
    if count <= 0:
        return
    t = np.arange(count, dtype=np.float32) / SAMPLE_RATE
    phase = 2 * np.pi * (250 * t + 1200 * t * t)
    env = np.sin(np.pi * np.minimum(1, t / duration)) ** 2
    track[left : left + count] += (np.sin(phase) * env * 0.16).astype(np.float32)


def build_original_audio(total: float, voice: np.ndarray, spans: list[dict]) -> np.ndarray:
    count = len(voice)
    music = np.zeros(count, dtype=np.float32)
    sfx = np.zeros(count, dtype=np.float32)
    rng = np.random.default_rng(8262026)
    bpm = 126
    beat = 60.0 / bpm
    roots = [48, 48, 53, 46, 51, 44, 48, 53, 48]
    root_changes = [span["start"] for span in spans]

    def midi(note: int) -> float:
        return 440.0 * (2 ** ((note - 69) / 12))

    step = 0
    while step * beat / 2 < total:
        start = step * beat / 2
        scene_index = max(0, min(len(roots) - 1, sum(start >= x for x in root_changes) - 1))
        root = roots[scene_index]
        degree = [0, 7, 12, 3, 7, 15, 12, 7][step % 8]
        add_tone(music, start, beat * 0.43, midi(root + degree + 12), 0.055, "pulse")
        if step % 2 == 0:
            add_tone(music, start, beat * 0.8, midi(root - 12), 0.11, "triangle")
            add_kick(music, start, 0.27 if step % 8 else 0.38)
        add_hat(music, start, rng, 0.045 if step % 2 else 0.065)
        step += 1

    for span in spans:
        add_transition(sfx, max(0.0, span["start"] - 0.18))
    for stamp in (2.0, 2.5, 3.0):
        add_tone(sfx, stamp, 0.11, 740 + stamp * 60, 0.15, "sine")

    # Voice-sensitive ducking keeps every Korean line intelligible.
    speaking = (np.abs(voice) > 0.012).astype(np.float32)
    window = 3200
    padded = np.pad(speaking, (window // 2, window // 2), mode="edge")
    cumulative = np.cumsum(np.insert(padded, 0, 0.0), dtype=np.float64)
    speaking = ((cumulative[window:] - cumulative[:-window]) / window)[: len(voice)].astype(np.float32)
    music_gain = 0.13 - 0.055 * np.minimum(1.0, speaking * 2.5)
    mono = voice * 0.9 + music * music_gain + sfx
    fade = min(len(mono) // 2, SAMPLE_RATE)
    mono[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)
    mono[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    mono = np.tanh(mono * 1.15) * 0.9
    right_music = np.roll(music * music_gain, 14)
    left = np.tanh(voice * 0.9 + music * music_gain + sfx) * 0.9
    right = np.tanh(voice * 0.9 + right_music + sfx) * 0.9
    return np.column_stack((left, right)).astype(np.float32)


def write_wav(path: Path, stereo: np.ndarray) -> None:
    pcm = (np.clip(stereo, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm.tobytes())


def make_srt(path: Path, schedule: list[dict]) -> None:
    blocks = []
    for index, item in enumerate(schedule, 1):
        blocks.append(
            f"{index}\n{srt_time(item['start'])} --> {srt_time(item['end'])}\n{item['text']}\n"
        )
    path.write_text("\n".join(blocks), encoding="utf-8-sig")


def make_vtt(path: Path, schedule: list[dict]) -> None:
    blocks = ["WEBVTT\n"]
    for item in schedule:
        start = srt_time(item["start"]).replace(",", ".")
        end = srt_time(item["end"]).replace(",", ".")
        blocks.append(f"{start} --> {end}\n{item['text']}\n")
    path.write_text("\n".join(blocks), encoding="utf-8")


def cover(image: Image.Image, progress: float, direction: int) -> Image.Image:
    image = image.convert("RGB")
    zoom = 1.03 + 0.035 * (0.5 - 0.5 * math.cos(progress * math.pi))
    scale = max(WIDTH / image.width, HEIGHT / image.height) * zoom
    size = (max(WIDTH, round(image.width * scale)), max(HEIGHT, round(image.height * scale)))
    resized = image.resize(size, Image.Resampling.LANCZOS)
    max_x = max(0, size[0] - WIDTH)
    max_y = max(0, size[1] - HEIGHT)
    x = int(max_x * ((progress if direction > 0 else 1 - progress) * 0.66 + 0.17))
    y = int(max_y * (0.36 + 0.18 * math.sin(progress * math.pi)))
    return resized.crop((x, y, x + WIDTH, y + HEIGHT))


def rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill, outline=None, width=1) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def fit_text(draw: ImageDraw.ImageDraw, text: str, box_width: int, base: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    size = base
    while size > 24:
        candidate = font(size, bold)
        if draw.textbbox((0, 0), text, font=candidate)[2] <= box_width:
            return candidate
        size -= 2
    return font(size, bold)


def draw_purpose_graphic(canvas: Image.Image, draw: ImageDraw.ImageDraw, scene_id: str, pulse: float) -> None:
    cyan = (98, 247, 209)
    yellow = (255, 213, 100)
    red = (255, 91, 111)
    if scene_id == "hook":
        draw.text((930, 175), "8.0", font=FONT_HUGE, fill=yellow, stroke_width=3, stroke_fill=(8, 19, 33))
        draw.text((982, 294), "SECONDS", font=FONT_SMALL, fill=(255, 255, 255))
    elif scene_id == "play":
        for index, (key, label) in enumerate((("Z", "경비원 도발"), ("X", "분신 만들기"))):
            x = 940 + index * 135
            rounded(draw, (x, 190, x + 100, 290), 18, (9, 19, 33, 235), yellow, 3)
            draw.text((x + 31, 203), key, font=font(42, True), fill=yellow)
            label_font = font(15 if index else 18, True)
            label_box = draw.textbbox((0, 0), label, font=label_font)
            draw.text((x + (100 - (label_box[2] - label_box[0])) / 2, 305), label, font=label_font, fill=(255, 255, 255))
    elif scene_id == "echo":
        colors = ((57, 189, 248), (182, 105, 255), (98, 247, 209))
        for index, color in enumerate(colors):
            x = 930 + index * 105
            y = 205 + (index % 2) * 45
            draw.ellipse((x, y, x + 72, y + 72), fill=color + (230,), outline=(255, 255, 255), width=3)
            draw.text((x + 24, y + 16), str(index + 1), font=font(26, True), fill=(9, 19, 33))
        draw.line((900, 340, 1190, 340), fill=yellow, width=7)
    elif scene_id == "radar":
        origin = (1005, 245)
        draw.polygon((origin, (1215, 125), (1215, 365)), fill=red + (85,), outline=red)
        draw.ellipse((975, 215, 1035, 275), fill=(18, 31, 48), outline=(255, 255, 255), width=3)
        draw.text((990, 220), "!", font=font(32, True), fill=red)
        draw.line((1005, 245, 1175, 245), fill=(255, 159, 67), width=5)
        draw.polygon(((1175, 245), (1152, 233), (1152, 257)), fill=(255, 213, 100))
    elif scene_id == "weapons":
        left, right, ground = 900, 1190, 340
        arrow_points = []
        net_points = []
        for index in range(31):
            progress = index / 30
            x = left + (right - left) * progress
            arrow_points.append((x, ground - 58 * 4 * progress * (1 - progress)))
            net_points.append((x, ground - 176 * 4 * progress * (1 - progress)))
        draw.line(arrow_points, fill=(255, 159, 67), width=5)
        draw.line(net_points, fill=(53, 207, 242), width=6)
        draw.text((900, 185), "ARROW 520", font=font(20, True), fill=(255, 159, 67))
        draw.text((900, 220), "NET 340", font=font(20, True), fill=(53, 207, 242))
        draw.text((1105, 300), "높은 궤도", font=font(16, True), fill=(255, 255, 255))
    elif scene_id == "boss":
        rounded(draw, (900, 170, 1190, 325), 28, (65, 12, 38, 225), red, 4)
        draw.text((920, 192), "CAPTAIN", font=font(48, True), fill=red)
        draw.text((953, 274), "FINAL LOOP", font=FONT_SMALL, fill=(255, 255, 255))
    elif scene_id == "score":
        draw.text((895, 175), "9,420", font=font(68, True), fill=yellow, stroke_width=2, stroke_fill=(8, 19, 33))
        draw.text((1098, 260), "S", font=font(80, True), fill=cyan)
    elif scene_id == "codex":
        rounded(draw, (885, 170, 1195, 325), 24, (7, 14, 25, 220), cyan, 3)
        draw.text((930, 195), "CODEX", font=font(52, True), fill=cyan)
        draw.text((948, 267), "BUILD  ✓  QA", font=FONT_SMALL, fill=(255, 255, 255))
    elif scene_id == "cta":
        rounded(draw, (820, 185, 1210, 330), 26, (9, 19, 33, 235), cyan, 4)
        draw.text((865, 210), "PLAY NOW", font=font(48, True), fill=cyan)
        draw.text((850, 282), "sdj3261.github.io/openai_game_2026", font=font(17, True), fill=(255, 255, 255))


def overlay_gradient() -> Image.Image:
    layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    pixels = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    xs = np.arange(WIDTH, dtype=np.float32)
    alpha = np.clip(235 - xs * 0.17, 34, 235).astype(np.uint8)
    pixels[:, :, 0] = 6
    pixels[:, :, 1] = 15
    pixels[:, :, 2] = 28
    pixels[:, :, 3] = alpha[None, :]
    return Image.fromarray(pixels, "RGBA")


GRADIENT = overlay_gradient()


def active_caption(schedule: list[dict], time_value: float, scene_index: int) -> str:
    matching = [item for item in schedule if item["scene"] == scene_index]
    for item in matching:
        if item["start"] <= time_value <= item["end"]:
            return item["text"]
    earlier = [item for item in matching if item["start"] <= time_value]
    return (earlier[-1] if earlier else matching[0])["text"]


CAPTURE_CACHE: dict[str, Image.Image] = {}


def load_capture(name: str) -> Image.Image:
    if name in CAPTURE_CACHE:
        return CAPTURE_CACHE[name]
    path = CAPTURES / name
    if not path.exists():
        blank = Image.new("RGB", (WIDTH, HEIGHT), (16, 33, 54))
        draw = ImageDraw.Draw(blank)
        draw.text((70, 590), f"GAME CAPTURE · {name}", font=FONT_SMALL, fill=(98, 247, 209))
        CAPTURE_CACHE[name] = blank
        return blank
    CAPTURE_CACHE[name] = Image.open(path).convert("RGB")
    return CAPTURE_CACHE[name]


def make_projectile_qa_capture() -> None:
    """Render an honest QA card from the tested projectile profiles.

    The preceding capture is the real in-game net-gun telegraph. This second
    frame deliberately labels itself as a unit-test visualization so the
    trailer never presents a synthetic arc as an in-game screenshot.
    """
    source = CAPTURES / "capture-07-stage5.png"
    if source.exists():
        canvas = Image.open(source).convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
        canvas = canvas.filter(ImageFilter.GaussianBlur(2.2)).convert("RGBA")
    else:
        canvas = Image.new("RGBA", (WIDTH, HEIGHT), (10, 22, 39, 255))
    tint = Image.new("RGBA", (WIDTH, HEIGHT), (5, 14, 27, 176))
    canvas = Image.alpha_composite(canvas, tint)
    draw = ImageDraw.Draw(canvas)

    white = (248, 251, 255, 255)
    cyan = (53, 207, 242, 255)
    orange = (255, 159, 67, 255)
    yellow = (255, 213, 100, 255)
    muted = (185, 205, 225, 255)
    rounded(draw, (58, 48, 1222, 652), 28, (8, 19, 34, 232), (98, 247, 209, 255), 3)
    draw.text((90, 76), "PROJECTILE PHYSICS · UNIT TEST", font=font(18, True), fill=(98, 247, 209))
    draw.text((90, 112), "화살과 그물, 서로 다른 회피 리듬", font=font(42, True), fill=white)
    draw.text((92, 168), "실제 프로필 수치로 그린 궤도 검증 화면", font=font(22, False), fill=muted)

    left, right, ground = 135, 1140, 520
    draw.line((left, ground, right, ground), fill=(104, 130, 159), width=3)

    def trajectory(apex: float) -> list[tuple[float, float]]:
        return [
            (left + (right - left) * p, ground - apex * 3.25 * 4 * p * (1 - p))
            for p in (index / 80 for index in range(81))
        ]

    draw.line(trajectory(22), fill=orange, width=7)
    draw.line(trajectory(68), fill=cyan, width=8)
    draw.ellipse((left - 10, ground - 10, left + 10, ground + 10), fill=yellow)
    draw.ellipse((right - 10, ground - 10, right + 10, ground + 10), fill=yellow)
    draw.text((145, 548), "화살 · 520 px/s · 예고 0.50초 · 최고점 22", font=font(20, True), fill=orange)
    draw.text((650, 548), "그물 · 340 px/s · 예고 0.65초 · 최고점 68", font=font(20, True), fill=cyan)
    draw.text((145, 595), "PASS · 프레임 분할 독립", font=font(18, True), fill=white)
    draw.text((420, 595), "PASS · 벽 스윕 충돌", font=font(18, True), fill=white)
    draw.text((665, 595), "PASS · 원형 몸 판정", font=font(18, True), fill=white)
    draw.text((925, 595), "PASS · 사거리 제한", font=font(18, True), fill=white)
    draw.text((980, 250), "그물 높은 궤도", font=font(20, True), fill=cyan)
    draw.text((520, 405), "화살 낮은 궤도", font=font(20, True), fill=orange)
    canvas.convert("RGB").save(CAPTURES / "capture-08-stage6.png", optimize=True)


def render_frame(scenes: list[dict], schedule: list[dict], spans: list[dict], total: float, time_value: float) -> Image.Image:
    scene_index = next((span["scene"] for span in spans if span["start"] <= time_value < span["end"]), 0 if time_value < spans[0]["start"] else len(scenes) - 1)
    span = spans[scene_index]
    scene = scenes[scene_index]
    progress = min(1.0, max(0.0, (time_value - span["start"]) / max(0.01, span["end"] - span["start"])))
    visual_index = min(len(scene["visuals"]) - 1, int(progress * len(scene["visuals"])))
    visual_progress = (progress * len(scene["visuals"])) % 1.0
    base = cover(load_capture(scene["visuals"][visual_index]), visual_progress, 1 if scene_index % 2 == 0 else -1)
    canvas = base.convert("RGBA")
    canvas.alpha_composite(GRADIENT)
    draw = ImageDraw.Draw(canvas)
    cyan = (98, 247, 209, 255)
    yellow = (255, 213, 100, 255)
    white = (248, 251, 255, 255)
    muted = (190, 207, 225, 255)
    navy = (9, 19, 33, 235)

    # Keep the title readable even when the underlying game menu contains a
    # large heading in the same area.
    rounded(draw, (42, 30, 825, 215), 24, (9, 19, 33, 198), (74, 102, 133, 220), 2)
    draw.text((64, 48), scene["eyebrow"], font=FONT_SMALL, fill=cyan)
    draw.text((1130, 48), f"{scene_index + 1:02d} / {len(scenes):02d}", font=FONT_SMALL, fill=muted)
    title_font = fit_text(draw, scene["title"], 690, 58, True)
    draw.text((60, 92), scene["title"], font=title_font, fill=white, stroke_width=2, stroke_fill=(6, 15, 28))
    draw.text((64, 178), scene["accent"], font=FONT_ACCENT, fill=yellow)
    y = 235
    for bullet in scene["bullets"]:
        text_box = draw.textbbox((0, 0), bullet, font=FONT_SMALL)
        width = text_box[2] + 42
        rounded(draw, (64, y, 64 + width, y + 42), 13, (9, 19, 33, 210), cyan, 2)
        draw.ellipse((78, y + 16, 86, y + 24), fill=cyan)
        draw.text((96, y + 10), bullet, font=FONT_SMALL, fill=white)
        y += 52

    draw_purpose_graphic(canvas, draw, scene["id"], math.sin(time_value * 4) * 0.5 + 0.5)

    caption = active_caption(schedule, time_value, scene_index)
    rounded(draw, (42, 548, 1238, 674), 24, navy, (84, 112, 145, 255), 2)
    caption_font = fit_text(draw, caption, 1090, 30, True)
    bounds = draw.textbbox((0, 0), caption, font=caption_font)
    draw.text(((WIDTH - (bounds[2] - bounds[0])) // 2, 584), caption, font=caption_font, fill=white)
    elapsed_width = int((WIDTH - 84) * min(1.0, time_value / total))
    draw.rounded_rectangle((42, 694, 1238, 704), radius=5, fill=(54, 76, 103, 255))
    if elapsed_width > 0:
        draw.rounded_rectangle((42, 694, 42 + elapsed_width, 704), radius=5, fill=cyan)
    edge = min(
        max(0.0, (time_value - span["start"]) / 0.42),
        max(0.0, (span["end"] - time_value) / 0.42),
        1.0,
    )
    if edge < 1.0:
        curtain = Image.new("RGBA", (WIDTH, HEIGHT), (4, 10, 18, int((1.0 - edge) * 185)))
        canvas = Image.alpha_composite(canvas, curtain)
    return canvas.convert("RGB")


def write_poster(scenes: list[dict], schedule: list[dict], spans: list[dict], total: float) -> None:
    poster = render_frame(scenes, schedule, spans, total, spans[0]["start"] + 1.6)
    poster.save(HERE / "poster.png", optimize=True)


def encode_video(ffmpeg: Path, scenes: list[dict], schedule: list[dict], spans: list[dict], total: float, audio_path: Path) -> None:
    output = HERE / "8-second-crew-demo.mp4"
    frame_count = math.ceil(total * FPS)
    command = [
        str(ffmpeg), "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS), "-i", "-",
        "-i", str(audio_path),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-maxrate", "900k", "-bufsize", "1800k",
        "-r", "24", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k", "-ar", "48000",
        "-movflags", "+faststart", "-shortest",
        "-metadata", "title=8초 도둑단 · OpenAI Game 2026 데모",
        "-metadata", "comment=실제 게임 캡처, 한국어 내레이션, 자체 생성 칩튠/SFX",
        str(output),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    try:
        for frame_index in range(frame_count):
            current = min(total - 1 / FPS, frame_index / FPS)
            frame = render_frame(scenes, schedule, spans, total, current)
            process.stdin.write(frame.tobytes())
            if frame_index % (FPS * 10) == 0:
                print(f"영상 렌더링 {current:5.1f}/{total:5.1f}초", flush=True)
    finally:
        process.stdin.close()
    code = process.wait()
    if code:
        raise SystemExit(code)


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    make_projectile_qa_capture()
    scenes = json.loads((HERE / "narration.json").read_text(encoding="utf-8"))
    schedule, spans, total, voice = build_timeline(scenes)
    if not (150 <= total <= 175):
        raise RuntimeError(f"영상 목표 길이를 벗어났습니다: {total:.2f}초")
    make_srt(HERE / "8-second-crew-demo.srt", schedule)
    make_vtt(HERE / "8-second-crew-demo.vtt", schedule)
    audio = build_original_audio(total, voice, spans)
    audio_path = WORK / "demo-mix.wav"
    write_wav(audio_path, audio)
    write_poster(scenes, schedule, spans, total)
    ffmpeg_value = os.environ.get("FFMPEG_PATH") or shutil.which("ffmpeg")
    if not ffmpeg_value:
        raise FileNotFoundError("FFMPEG_PATH를 설정하거나 ffmpeg를 PATH에 추가해 주세요.")
    ffmpeg = Path(ffmpeg_value)
    if not ffmpeg.exists():
        raise FileNotFoundError(f"ffmpeg를 찾을 수 없습니다: {ffmpeg}")
    encode_video(ffmpeg, scenes, schedule, spans, total, audio_path)
    print(f"완료: {HERE / '8-second-crew-demo.mp4'} ({total:.2f}초)")


if __name__ == "__main__":
    main()

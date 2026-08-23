"""Render a reproducible Codex collaboration card from the real source tree."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / ".work" / "captures" / "capture-13-code.png"
W, H = 1280, 720


def font(size: int, bold: bool = False):
    path = Path(f"C:/Windows/Fonts/{'malgunbd' if bold else 'malgun'}.ttf")
    return ImageFont.truetype(str(path), size)


def clip_lines(path: Path, terms: tuple[str, ...], limit: int = 8) -> list[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    hits = [line.strip() for line in lines if any(term in line for term in terms)]
    return [line[:92] for line in hits[:limit]]


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (W, H), "#091321")
    draw = ImageDraw.Draw(image)
    cyan, yellow, white, muted = "#62f7d1", "#ffd564", "#f8fbff", "#91a7bf"
    draw.text((62, 48), "CODEX COLLABORATION", font=font(20, True), fill=cyan)
    draw.text((58, 84), "기획에서 QA까지", font=font(56, True), fill=white)
    draw.text((62, 158), "사람이 재미를 결정하고, Codex가 빠르게 만들고 검증했습니다.", font=font(24), fill=yellow)

    panels = [
        (58, 218, 610, 592, "GAME LOGIC  game.js", clip_lines(ROOT / "game.js", ("calculateStealthScore", "canEscape", "visionPolygon", "saveAndRewind"))),
        (638, 218, 1222, 592, "AUTOMATED QA", [
            "PASS  input-utils.test.mjs  입력 판정",
            "PASS  profile-utils.test.mjs  점수와 랭킹",
            "PASS  i18n.test.mjs  한국어와 영어와 일본어",
            "PASS  level-layout.test.mjs  9개 스테이지 경로",
            "PASS  PC 1280×720  Mobile 390×844",
            "PASS  레이더 시각 영역 = 충돌 판정",
            "PASS  전체 자동 테스트 53개",
        ]),
    ]
    for x1, y1, x2, y2, title, lines in panels:
        draw.rounded_rectangle((x1, y1, x2, y2), 18, fill="#101f34", outline="#49617f", width=2)
        draw.text((x1 + 24, y1 + 20), title, font=font(19, True), fill=cyan)
        y = y1 + 68
        for line in lines:
            draw.text((x1 + 24, y), line, font=font(16), fill=white if line.startswith("PASS") else muted)
            y += 38

    draw.rounded_rectangle((58, 620, 1222, 680), 16, fill="#162c45", outline=cyan, width=2)
    draw.text((86, 636), "기획, 구현, 플레이 테스트, 수정, 자동 테스트, 배포", font=font(22, True), fill=white)
    image.save(OUT, optimize=True)
    print(OUT)


if __name__ == "__main__":
    main()

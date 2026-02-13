from pathlib import Path

from PIL import Image


def main() -> None:
    src = Path("static/logo.jpg")
    out = Path("build/icon.ico")
    out.parent.mkdir(parents=True, exist_ok=True)

    img = Image.open(src).convert("RGBA")
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save(out, format="ICO", sizes=sizes)


if __name__ == "__main__":
    main()

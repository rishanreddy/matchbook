import tomllib
from pathlib import Path


def main() -> None:
    pyproject = Path(__file__).resolve().parents[1] / "pyproject.toml"
    data = tomllib.loads(pyproject.read_text(encoding="utf-8"))
    print(data["project"]["version"])


if __name__ == "__main__":
    main()

import sys

from pokemon_harness.config import HarnessSettings, PreflightError


def main() -> None:
    settings = HarnessSettings()
    try:
        _ = settings.require_real_rom_paths()
    except PreflightError as error:
        _ = sys.stderr.write(f"{error}\n")
        raise SystemExit(1) from error
    else:
        _ = sys.stdout.write("real-ROM preflight passed\n")


if __name__ == "__main__":
    main()

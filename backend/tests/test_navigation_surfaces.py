from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from pokemon_harness.app import create_app
from pokemon_harness.fake_emulator import FakeEmulator
from pokemon_harness.grid_overlay import (
    BLOCK_SIZE,
    GRID_COLUMNS,
    GRID_ROWS,
    render_grid_overlay_png,
)
from pokemon_harness.save_store import SaveStore


def test_map_ascii_returns_centered_grid(tmp_path: Path) -> None:
    client = TestClient(create_app(emulator=FakeEmulator(), save_store=SaveStore(root=tmp_path)))

    response = client.get("/map/ascii")

    assert response.status_code == 200
    body = response.json()
    assert body["playerCell"] == "E5"
    assert body["passableDirections"] == ["up", "left", "right"]
    assert "A B C D E F G H I J" in body["ascii"]
    assert "5" in body["ascii"]
    assert "@" in body["ascii"]


def test_grid_screenshot_draws_visible_overlay(tmp_path: Path) -> None:
    emulator = FakeEmulator()
    client = TestClient(create_app(emulator=emulator, save_store=SaveStore(root=tmp_path)))

    response = client.get("/screenshot/grid?scale=2")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    overlay = Image.open(BytesIO(response.content))
    plain = Image.open(BytesIO(emulator.screenshot_png()))
    assert overlay.size == (plain.width * 2, plain.height * 2)
    assert len(overlay.getcolors(maxcolors=10000) or ()) > len(
        plain.getcolors(maxcolors=10000) or ()
    )


def test_grid_screenshot_centers_coordinate_labels() -> None:
    scale = 4
    cell = BLOCK_SIZE * scale

    overlay = Image.open(
        BytesIO(
            render_grid_overlay_png(
                screenshot_png=_solid_screenshot_png(),
                walkable=_all_walkable_grid(),
                scale=scale,
            )
        )
    ).convert("RGB")

    assert _is_label_chip_pixel(_rgb_at(overlay, (cell // 2, cell // 2)))
    assert not _is_label_chip_pixel(_rgb_at(overlay, (3, 8)))


def test_grid_screenshot_keeps_centered_labels_inside_small_scale_cells() -> None:
    overlay = Image.open(
        BytesIO(
            render_grid_overlay_png(
                screenshot_png=_solid_screenshot_png(),
                walkable=_all_walkable_grid(),
                scale=1,
            )
        )
    ).convert("RGB")

    assert overlay.size == (BLOCK_SIZE * GRID_COLUMNS, BLOCK_SIZE * GRID_ROWS)
    assert _is_label_chip_pixel(_rgb_at(overlay, (BLOCK_SIZE // 2, BLOCK_SIZE // 2)))


def test_grid_screenshot_rejects_invalid_scale(tmp_path: Path) -> None:
    client = TestClient(create_app(emulator=FakeEmulator(), save_store=SaveStore(root=tmp_path)))

    response = client.get("/screenshot/grid?scale=0")

    assert response.status_code == 422


def _solid_screenshot_png() -> bytes:
    image = Image.new("RGB", (BLOCK_SIZE * GRID_COLUMNS, BLOCK_SIZE * GRID_ROWS), "#9bbc0f")
    output = BytesIO()
    image.save(output, "PNG")
    return output.getvalue()


def _all_walkable_grid() -> tuple[tuple[bool, ...], ...]:
    return tuple(tuple(True for _ in range(GRID_COLUMNS)) for _ in range(GRID_ROWS))


def _rgb_at(image: Image.Image, point: tuple[int, int]) -> tuple[int, int, int]:
    pixel = image.getpixel(point)
    match pixel:
        case (int(red), int(green), int(blue)):
            return (red, green, blue)
        case (int(red), int(green), int(blue), *_):
            return (red, green, blue)
        case int(gray):
            return (gray, gray, gray)
        case unmatched:
            pytest.fail(f"expected RGB-compatible pixel at {point}, got {unmatched!r}")


def _is_label_chip_pixel(pixel: tuple[int, int, int]) -> bool:
    red, green, blue = pixel
    return red < 90 and green < 100 and blue < 80

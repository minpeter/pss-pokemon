from io import BytesIO
from typing import Final

from PIL import Image, ImageDraw, ImageFont

BLOCK_SIZE: Final = 16
GRID_COLUMNS: Final = 10
GRID_ROWS: Final = 9
SCREEN_WIDTH: Final = BLOCK_SIZE * GRID_COLUMNS
SCREEN_HEIGHT: Final = BLOCK_SIZE * GRID_ROWS
PLAYER_COLUMN: Final = 4
PLAYER_ROW: Final = 4
COL_LABELS: Final = "ABCDEFGHIJ"


def render_grid_overlay_png(
    *,
    screenshot_png: bytes,
    walkable: tuple[tuple[bool, ...], ...],
    scale: int,
) -> bytes:
    image = Image.open(BytesIO(screenshot_png)).convert("RGBA")
    image = image.resize((SCREEN_WIDTH, SCREEN_HEIGHT), Image.Resampling.NEAREST)
    scaled = image.resize((SCREEN_WIDTH * scale, SCREEN_HEIGHT * scale), Image.Resampling.NEAREST)
    overlay = Image.new("RGBA", scaled.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    cell = BLOCK_SIZE * scale
    font = _font(max(10, cell // 3))
    _draw_walkability(draw=draw, walkable=walkable, cell=cell)
    _draw_player(draw=draw, cell=cell, scale=scale)
    _draw_grid(draw=draw, width=scaled.width, height=scaled.height, cell=cell)
    _draw_labels(draw=draw, cell=cell, font=font)
    output = BytesIO()
    Image.alpha_composite(scaled, overlay).convert("RGB").save(output, format="PNG")
    return output.getvalue()


def _draw_walkability(
    *,
    draw: ImageDraw.ImageDraw,
    walkable: tuple[tuple[bool, ...], ...],
    cell: int,
) -> None:
    for row_index, row in enumerate(walkable[:GRID_ROWS]):
        for column_index, passable in enumerate(row[:GRID_COLUMNS]):
            if row_index == PLAYER_ROW and column_index == PLAYER_COLUMN:
                continue
            color = (139, 172, 15, 45) if passable else (217, 72, 47, 80)
            left = column_index * cell
            top = row_index * cell
            draw.rectangle((left, top, left + cell - 1, top + cell - 1), fill=color)


def _draw_player(*, draw: ImageDraw.ImageDraw, cell: int, scale: int) -> None:
    left = PLAYER_COLUMN * cell
    top = PLAYER_ROW * cell
    draw.rectangle(
        (left, top, left + cell - 1, top + cell - 1),
        outline=(217, 72, 47, 235),
        width=max(2, scale),
    )


def _draw_grid(*, draw: ImageDraw.ImageDraw, width: int, height: int, cell: int) -> None:
    for column in range(GRID_COLUMNS + 1):
        x = column * cell
        draw.line((x, 0, x, height), fill=(15, 56, 15, 210), width=1)
    for row in range(GRID_ROWS + 1):
        y = row * cell
        draw.line((0, y, width, y), fill=(15, 56, 15, 210), width=1)


type OverlayFont = ImageFont.ImageFont | ImageFont.FreeTypeFont


def _draw_labels(*, draw: ImageDraw.ImageDraw, cell: int, font: OverlayFont) -> None:
    for row in range(GRID_ROWS):
        for column in range(GRID_COLUMNS):
            label = f"{COL_LABELS[column]}{row + 1}"
            left, top = _centered_label_origin(
                draw=draw,
                label=label,
                font=font,
                cell_origin=(column * cell, row * cell),
                cell=cell,
            )
            box = draw.textbbox((left, top), label, font=font)
            draw.rectangle((box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1), fill=(15, 19, 15, 170))
            draw.text((left, top), label, fill=(232, 228, 214, 255), font=font)


def _centered_label_origin(
    *,
    draw: ImageDraw.ImageDraw,
    label: str,
    font: OverlayFont,
    cell_origin: tuple[int, int],
    cell: int,
) -> tuple[int, int]:
    box = draw.textbbox((0, 0), label, font=font)
    box_left = round(box[0])
    box_top = round(box[1])
    text_width = round(box[2] - box[0])
    text_height = round(box[3] - box[1])
    left = cell_origin[0] + ((cell - text_width) // 2) - box_left
    top = cell_origin[1] + ((cell - text_height) // 2) - box_top
    return (left, top)


def _font(size: int) -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    return ImageFont.load_default(size=size)

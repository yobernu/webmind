"""Regenerates the Gloss AI brand assets from Newsreader outlines.

Requires fonttools and brotli (`pip install fonttools brotli`) and the
@fontsource-variable/newsreader package installed in apps/extension.

    python project_docs/brand/generate.py

Writes the SVGs next to this file and apps/extension/src/ui/brand/paths.ts.
PNG icons are rendered from mark*.svg separately (see README.md).
"""
import json
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FONTS = ROOT / "apps/extension/node_modules/@fontsource-variable/newsreader/files"
PATHS_TS = ROOT / "apps/extension/src/ui/brand/paths.ts"

INK, PAPER, HIGHLIGHT = "#1C1B19", "#FAF8F3", "#F5D547"
INK_2, DARK_PAPER, DARK_INK, DARK_INK_2 = "#55524B", "#191816", "#EDE9E0", "#B5B0A5"

_cache = {}


def instance(wght, opsz):
    key = (wght, opsz)
    if key not in _cache:
        font = TTFont(FONTS / "newsreader-latin-opsz-normal.woff2")
        _cache[key] = instantiateVariableFont(font, {"wght": wght, "opsz": opsz})
    return _cache[key]


def number(value):
    """A tenth of a font unit is far below anything visible at 2000/em."""
    text = f"{value:.1f}".rstrip("0").rstrip(".")
    return "0" if text == "-0" else text


def outline(text, wght, opsz):
    """SVG path data for `text`, baseline at y=0, y pointing down (2000/em)."""
    font = instance(wght, opsz)
    glyphs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
    pen, x = SVGPathPen(glyphs, ntos=number), 0
    for ch in text:
        name = cmap[ord(ch)]
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        x += hmtx[name][0]
    os2 = font["OS/2"]
    return {"d": pen.getCommands(), "width": x, "xHeight": os2.sxHeight, "capHeight": os2.sCapHeight}


def bounds(ch, wght, opsz):
    font = instance(wght, opsz)
    glyphs = font.getGlyphSet()
    pen = BoundsPen(glyphs)
    glyphs[font.getBestCmap()[ord(ch)]].draw(pen)
    xmin, ymin, xmax, ymax = pen.bounds
    return {"xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax}


def fit(b, tile, pad_top, pad_bottom, nudge_x=0.0):
    s = (tile - pad_top - pad_bottom) / (b["ymax"] - b["ymin"])
    tx = tile / 2 - (b["xmin"] + b["xmax"]) / 2 * s + nudge_x
    return s, tx, pad_top + b["ymax"] * s


def swipe(s, tx, base, b, top_units, bottom_units, overhang):
    x0, x1 = tx + b["xmin"] * s - overhang, tx + b["xmax"] * s + overhang
    y0, y1 = base - top_units * s, base - bottom_units * s
    return x0, y0, x1 - x0, y1 - y0


def tile_mark(spec, tile, rx, pad, swipe_units, overhang, uid, nudge_x=0.0):
    """App-icon mark: paper "g" on an ink tile, knocked out to ink where it
    crosses the highlighter swipe so the letter stays legible."""
    g, b = outline("g", *spec), bounds("g", *spec)
    s, tx, base = fit(b, tile, pad[0], pad[1], nudge_x)
    x, y, w, h = swipe(s, tx, base, b, *swipe_units, overhang)
    rect = (f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" '
            f'transform="rotate(-6 {x + w / 2:.2f} {y + h / 2:.2f})"/>')
    t = f"translate({tx:.3f} {base:.3f}) scale({s:.6f})"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{tile}" height="{tile}" viewBox="0 0 {tile} {tile}">'
        f'<defs><clipPath id="gloss-swipe-{uid}">{rect}</clipPath></defs>'
        f'<rect width="{tile}" height="{tile}" rx="{rx}" fill="{INK}"/>'
        f'<g fill="{HIGHLIGHT}">{rect}</g>'
        f'<path fill="{PAPER}" transform="{t}" d="{g["d"]}"/>'
        # On a wrapping group: on the path, the clip would be read in the
        # glyph's scaled coordinate space.
        f'<g clip-path="url(#gloss-swipe-{uid})"><path fill="{INK}" transform="{t}" d="{g["d"]}"/></g>'
        "</svg>"
    )


def main():
    master = (560, 72)
    marks = {
        "mark.svg": tile_mark(master, 64, 14, (9, 9), (330, -40), 4, "m"),
        "mark-32.svg": tile_mark((620, 36), 32, 7, (3.6, 3.6), (340, -40), 2, "m32"),
        # 16px is drawn separately: heavier, and a thinner swipe through the
        # link only, so the bowl and loop stay whole.
        "mark-16.svg": tile_mark((700, 18), 16, 3.5, (1.4, 1.2), (170, -20), 0.6, "m16", 0.1),
    }
    for name, svg in marks.items():
        (HERE / name).write_text(svg)

    # Bare mark for the UI: ink "g" over the swipe, 24 grid.
    g, b = outline("g", *master), bounds("g", *master)
    s, tx, base = fit(b, 24, 0.5, 0.5)
    x, y, w, h = swipe(s, tx, base, b, 330, -40, 1.6)
    sw = {"x": round(x, 2), "y": round(y, 2), "w": round(w, 2), "h": round(h, 2),
          "cx": round(x + w / 2, 2), "cy": round(y + h / 2, 2)}
    glyph_t = f"translate({tx:.3f} {base:.3f}) scale({s:.6f})"
    (HERE / "mark-bare.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24">'
        f'<rect x="{sw["x"]}" y="{sw["y"]}" width="{sw["w"]}" height="{sw["h"]}" fill="{HIGHLIGHT}" '
        f'transform="rotate(-6 {sw["cx"]} {sw["cy"]})"/>'
        f'<path fill="{INK}" transform="{glyph_t}" d="{g["d"]}"/></svg>')

    # Wordmark: "gloss" at display size; "AI" as small caps whose cap height
    # matches the x-height, spaced 0.3em after and tracked +0.1em.
    gloss, a, i = outline("gloss", 480, 72), outline("A", 600, 18), outline("I", 600, 18)
    x_height = gloss["xHeight"]
    k = x_height / a["capHeight"]
    ax = gloss["width"] + 600
    ix = ax + a["width"] * k + 200 * k
    total = ix + i["width"] * k
    asc, desc = 1100, 480
    viewbox = f"0 {-asc} {total:.0f} {asc + desc}"

    def words(gloss_fill, ai_fill):
        return (f'<path fill="{gloss_fill}" d="{gloss["d"]}"/><g fill="{ai_fill}">'
                f'<path transform="translate({ax:.1f} 0) scale({k:.4f})" d="{a["d"]}"/>'
                f'<path transform="translate({ix:.1f} 0) scale({k:.4f})" d="{i["d"]}"/></g>')

    for name, fills in {"wordmark.svg": (INK, INK_2), "wordmark-dark.svg": (DARK_INK, DARK_INK_2)}.items():
        (HERE / name).write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" height="48">{words(*fills)}</svg>')

    def lockup(bg, fills, tile_fill, tile_stroke=None):
        height, gap = 64, 18
        scale = height * 0.42 / x_height
        width = height + gap + total * scale
        baseline = height / 2 + x_height * scale / 2
        tile = marks["mark.svg"].split(">", 1)[1].rsplit("</svg>", 1)[0]
        stroke = f' stroke="{tile_stroke}" stroke-width="1"' if tile_stroke else ""
        tile = tile.replace(f'rx="14" fill="{INK}"', f'rx="14" fill="{tile_fill}"{stroke}', 1)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width + 48:.0f}" height="{height + 48}" '
                f'viewBox="0 0 {width + 48:.0f} {height + 48}"><rect width="100%" height="100%" fill="{bg}"/>'
                f'<g transform="translate(24 24)">{tile}<g transform="translate({height + gap} {baseline:.2f}) '
                f'scale({scale:.5f})">{words(*fills)}</g></g></svg>')

    (HERE / "lockup-light.svg").write_text(lockup(PAPER, (INK, INK_2), INK))
    (HERE / "lockup-dark.svg").write_text(lockup(DARK_PAPER, (DARK_INK, DARK_INK_2), "#2B2925", "#3A3833"))

    PATHS_TS.write_text(f'''// Generated by project_docs/brand/generate.py from Newsreader outlines.
// Do not edit by hand.

/** "gloss" at Newsreader opsz 72 / wght 480, font units (2000/em), baseline y=0. */
export const WORDMARK_GLOSS = {json.dumps(gloss["d"])}

/** The small-caps "AI", positioned after "gloss" in the same units. */
export const WORDMARK_AI = [
  {{ transform: "translate({ax:.1f} 0) scale({k:.4f})", d: {json.dumps(a["d"])} }},
  {{ transform: "translate({ix:.1f} 0) scale({k:.4f})", d: {json.dumps(i["d"])} }},
] as const

export const WORDMARK_VIEWBOX = "{viewbox}"
/** Width over height, for sizing the wordmark by its height. */
export const WORDMARK_RATIO = {total / (asc + desc):.4f}

/** The bare mark: Newsreader "g" over a highlighter swipe, on a 24 grid. */
export const MARK = {{
  viewBox: "0 0 24 24",
  glyph: {{ transform: "{glyph_t}", d: {json.dumps(g["d"])} }},
  swipe: {json.dumps(sw)},
}} as const
''')
    print("Brand assets written.")


if __name__ == "__main__":
    main()

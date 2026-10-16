"""Build the README hero: docs/assets/hero-dark.svg, hero-light.svg, hero-static.svg.

Standard library only. Every figure and name is taken from the deployed run recorded in
docs/evidence. The static variant is the same frame with no animation, and it is also
what the animated variants show under prefers-reduced-motion: each element's base style
is the final state, and all animation lives inside a no-preference media query.
"""

from __future__ import annotations

from pathlib import Path

OUT = Path(__file__).resolve().parent.parent

W, H = 1200, 620
LOOP = "10s"

PALETTES = {
    "dark": {
        "bg": "#0E0C0A",
        "glow": "#E8B064",
        "card": "#1A1714",
        "line": "#2B2620",
        "line2": "#3A342C",
        "ink": "#EFE8DA",
        "ink2": "#C4BBAC",
        "ink3": "#948B7D",
        "amber": "#E8B064",
        "coral": "#E3876A",
        "sage": "#9CCBAE",
        "on_accent": "#1A1206",
    },
    "light": {
        "bg": "#F3EEE4",
        "glow": "#C97B5C",
        "card": "#FBF8F2",
        "line": "#D6CDBD",
        "line2": "#C9BFAE",
        "ink": "#22201C",
        "ink2": "#4A453E",
        "ink3": "#5F584E",
        "amber": "#8A5A14",
        "coral": "#9A3E22",
        "sage": "#2E6A48",
        "on_accent": "#FBF8F2",
    },
}

SERIF = "Georgia, 'Times New Roman', Times, serif"
SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"

# Lane rows: name baseline y. Batches B09-B11 sit in the Pilot row in the final frame
# and start 80 units higher, in the South row.
ROW = {"North": 236, "South": 316, "Pilot": 396}
LANE_SHIFT = ROW["Pilot"] - ROW["South"]


def check(d: str) -> str:
    """A tick drawn as a path, so it never depends on a font having the glyph."""
    return f'<path d="{d}" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'


def svg(p: dict[str, str], animated: bool) -> str:
    c = p
    parts: list[str] = []
    a = parts.append

    a(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
        'role="img" aria-labelledby="t d">'
    )
    a("<title id=\"t\">ResultRipple: one evidence correction, every registered use, the right reviewer</title>")
    a(
        '<desc id="d">Batches B09 to B11 move from South to Pilot. The shared finding reverses from '
        "South 40 cents cheaper to 40 cents more expensive than North. The change reaches the "
        "Operations Cost Review, the South Expansion Memo and the South lane expansion proposal. "
        "Review authority moves from Noor Haddad to Sam Oyelaran, so Noor's approved plan v1 is "
        "refused with AUTHORITY_CHANGED. Sam approves plan v2 and Version 2 is issued.</desc>"
    )
    a("<defs>")
    a(
        f'<radialGradient id="g" cx="40%" cy="52%" r="60%"><stop offset="0" stop-color="{c["glow"]}" '
        f'stop-opacity=".16"/><stop offset="1" stop-color="{c["glow"]}" stop-opacity="0"/></radialGradient>'
    )
    a("<style>")
    a(
        f".s{{font-family:{SERIF}}}.f{{font-family:{SANS}}}.m{{font-family:{MONO}}}"
        f".ink{{fill:{c['ink']}}}.ink2{{fill:{c['ink2']}}}.ink3{{fill:{c['ink3']}}}"
        f".amb{{fill:{c['amber']}}}.cor{{fill:{c['coral']}}}.sag{{fill:{c['sage']}}}"
        ".k{letter-spacing:2.5px}"
    )
    if animated:
        a(ANIMATION.replace("LOOP", LOOP))
    a("</style></defs>")

    a(f'<rect width="{W}" height="{H}" fill="{c["bg"]}"/>')
    a(f'<rect width="{W}" height="{H}" fill="url(#g)"/>')

    # Header.
    a(f'<text x="56" y="58" class="m k amb" font-size="15">GRAPH HACKS 2026 · TRACK 3 — COMPANY BRAIN</text>')
    a(
        f'<text x="52" y="118" class="s ink" font-size="58">Result<tspan class="amb" font-style="italic">Ripple</tspan></text>'
    )
    a(f'<text x="1144" y="84" class="f ink" font-size="22" text-anchor="end">Correct the evidence once.</text>')
    a(
        f'<text x="1144" y="116" class="f ink2" font-size="20" text-anchor="end">'
        "Every registered use, the decision and the right reviewer follow.</text>"
    )
    a(f'<path d="M56 146H1144" stroke="{c["line"]}" stroke-width="1"/>')

    a('<g id="scene">')

    # Ripple rings behind the finding: static texture plus one animated ring.
    for r, o in ((150, 0.10), (230, 0.07), (310, 0.05)):
        a(f'<circle cx="537" cy="343" r="{r}" fill="none" stroke="{c["amber"]}" stroke-opacity="{o}"/>')
    a(f'<circle id="ring" cx="537" cy="343" r="150" fill="none" stroke="{c["amber"]}" stroke-width="2" opacity="0"/>')

    # Column headers with step numbers.
    for i, (x, label) in enumerate(
        ((56, "EVIDENCE"), (384, "FINDING"), (712, "PUBLISHED USES"), (996, "AUTHORITY")), start=1
    ):
        a(f'<text x="{x}" y="186" class="m k ink3" font-size="14"><tspan id="n{i}">{i}</tspan>  {label}</text>')

    # Evidence: three lanes.
    for lane, y in ROW.items():
        a(f'<text x="56" y="{y}" class="s ink" font-size="27">{lane}</text>')
        for j in range(4):
            a(f'<circle cx="{156 + j * 20}" cy="{y - 9}" r="6" fill="{c["ink3"]}"/>')
    a(f'<text x="56" y="{ROW["North"] + 26}" class="m ink3" font-size="16">400¢ mean · 4 batches</text>')
    a(f'<text id="sOld" x="56" y="{ROW["South"] + 26}" class="m ink3" font-size="16" opacity="0">360¢ mean · 7 batches</text>')
    a(f'<text id="sNew" x="56" y="{ROW["South"] + 26}" class="m cor" font-size="16">440¢ mean · 4 batches</text>')
    a(f'<text id="pOld" x="56" y="{ROW["Pilot"] + 26}" class="m ink3" font-size="16" opacity="0">4 batches · not compared</text>')
    a(f'<text id="pNew" x="56" y="{ROW["Pilot"] + 26}" class="m ink3" font-size="16">7 batches · not compared</text>')
    a('<g id="chips">')
    for j, b in enumerate(("B09", "B10", "B11")):
        x = 238 + j * 40
        a(
            f'<rect x="{x}" y="{ROW["Pilot"] - 22}" width="36" height="25" rx="5" fill="{c["card"]}" '
            f'stroke="{c["amber"]}" stroke-width="1.5"/>'
            f'<text x="{x + 18}" y="{ROW["Pilot"] - 4}" class="m amb" font-size="13" text-anchor="middle">{b}</text>'
        )
    a("</g>")
    a(f'<text x="56" y="470" class="m ink3" font-size="15">DX-2026-0914 · South → Pilot</text>')
    a(f'<text x="56" y="492" class="m ink3" font-size="15">raw CSV 9f32c902… unchanged</text>')

    # The shared finding.
    a(f'<rect x="384" y="250" width="306" height="186" rx="14" fill="{c["card"]}" stroke="{c["amber"]}" stroke-opacity=".7"/>')
    a(f'<text x="408" y="282" class="m k amb" font-size="14">SHARED FINDING</text>')
    a(f'<text x="408" y="316" class="f ink2" font-size="19">South vs North</text>')
    a(f'<text id="fOld" x="408" y="362" class="s ink" font-size="28" opacity="0">40¢ cheaper</text>')
    a(f'<text id="fNew" x="408" y="362" class="s cor" font-size="28">40¢ more expensive</text>')
    a(f'<text id="mOld" x="408" y="396" class="m ink3" font-size="16" opacity="0">North 400¢ · South 360¢</text>')
    a(f'<text id="mNew" x="408" y="396" class="m ink3" font-size="16">North 400¢ · South 440¢</text>')
    a(f'<text x="408" y="420" class="m ink3" font-size="14">1 claim · 2 registered uses</text>')

    # Edges to the published uses and the decision, with pulses for the ripple.
    targets = (
        (200, "Operations Cost Review", "owner Ari · dollars card", "CURRENT", "CORRECTED", "t1"),
        (306, "South Expansion Memo", "owner Sam · cents card", "CURRENT", "CORRECTED", "t2"),
        (412, "South lane expansion proposal", "decision · basis: the finding", "PROPOSED", "RETURNED FOR REVIEW", "t3"),
    )
    for k, (ty, *_rest) in enumerate(targets, start=1):
        d = f"M690 343C704 343 698 {ty + 42} 712 {ty + 42}"
        a(f'<path d="{d}" fill="none" stroke="{c["line2"]}" stroke-width="2"/>')
        a(
            f'<path id="p{k}" d="{d}" pathLength="1" fill="none" stroke="{c["amber"]}" stroke-width="3" '
            'stroke-linecap="round" stroke-dasharray=".35 1" stroke-dashoffset=".35" opacity="0"/>'
        )
    for ty, title, sub, old, new, tid in targets:
        a(f'<rect x="712" y="{ty}" width="250" height="84" rx="10" fill="{c["card"]}" stroke="{c["line2"]}"/>')
        a(f'<text x="728" y="{ty + 27}" class="f ink" font-size="16" font-weight="600">{title}</text>')
        a(f'<text x="728" y="{ty + 49}" class="m ink3" font-size="14">{sub}</text>')
        a(f'<text id="{tid}o" x="728" y="{ty + 72}" class="m k ink3" font-size="14" opacity="0">{old}</text>')
        a(f'<text id="{tid}n" x="728" y="{ty + 72}" class="m k sag" font-size="14">{new}</text>')

    # Authority: the team's REVIEWED_BY edge moves from Noor to Sam.
    a(f'<circle cx="1080" cy="228" r="9" fill="{c["ink2"]}"/>')
    a(f'<text x="1080" y="258" class="f ink" font-size="16" text-anchor="middle">Operations Review</text>')
    a(f'<text x="1080" y="276" class="m ink3" font-size="12" text-anchor="middle">owns the proposal</text>')
    a(f'<path id="eNoor" d="M1072 284L1030 352" stroke="{c["ink3"]}" stroke-width="2" stroke-dasharray="4 5" opacity=".55"/>')
    a(
        f'<path id="eSam" d="M1088 284L1130 352" pathLength="1" stroke="{c["amber"]}" stroke-width="2.6" '
        'stroke-dasharray="1 1" stroke-dashoffset="0"/>'
    )
    a(f'<text x="1114" y="306" class="m ink3" font-size="12">REVIEWED_BY</text>')
    a(f'<circle cx="1026" cy="362" r="9" fill="none" stroke="{c["ink3"]}" stroke-width="2"/>')
    a(f'<circle id="samRing" cx="1134" cy="362" r="15" fill="none" stroke="{c["amber"]}" stroke-width="1.5"/>')
    a(f'<circle cx="1134" cy="362" r="9" fill="{c["amber"]}"/>')
    a(f'<text x="1026" y="396" class="f ink" font-size="15" text-anchor="middle">Noor Haddad</text>')
    a(f'<text id="noorOld" x="1026" y="414" class="m amb" font-size="12" text-anchor="middle" opacity="0">reviewer</text>')
    a(f'<text id="noorNew" x="1026" y="414" class="m ink3" font-size="12" text-anchor="middle">no authority</text>')
    a(f'<text x="1134" y="396" class="f ink" font-size="15" text-anchor="middle">Sam Oyelaran</text>')
    a(f'<text id="samNew" x="1134" y="414" class="m amb" font-size="12" text-anchor="middle">current reviewer</text>')
    a(f'<text x="996" y="462" class="m ink3" font-size="14">Sam owns the memo too;</text>')
    a(f'<text x="996" y="480" class="m ink3" font-size="14">authority comes from</text>')
    a(f'<text x="996" y="498" class="m ink3" font-size="14">the team edge alone.</text>')

    # Release outcomes.
    a('<g id="b5">')
    a(f'<rect x="56" y="522" width="534" height="58" rx="10" fill="{c["card"]}" stroke="{c["line2"]}"/>')
    a(f'<text x="76" y="546" class="m ink3" font-size="13">5</text>')
    a(f'<text x="96" y="557" class="f ink" font-size="17">Noor issues plan v1</text>')
    a('<g id="stamp">')
    a(f'<rect x="300" y="535" width="272" height="32" rx="6" fill="none" stroke="{c["coral"]}" stroke-width="2"/>')
    a(f'<text x="436" y="557" class="m cor" font-size="15" font-weight="700" text-anchor="middle">REFUSED · AUTHORITY_CHANGED</text>')
    a("</g></g>")
    a('<g id="b6">')
    a(f'<rect x="610" y="522" width="534" height="58" rx="10" fill="{c["card"]}" stroke="{c["line2"]}"/>')
    a(f'<text x="626" y="546" class="m ink3" font-size="13">6</text>')
    a(f'<g stroke="{c["sage"]}" transform="translate(642 540)">{check("M2 10l6 6L19 4")}</g>')
    a(f'<text x="668" y="557" class="f ink" font-size="17">Sam approves plan v2</text>')
    a('<g id="pill">')
    a(f'<rect x="856" y="535" width="278" height="32" rx="16" fill="{c["sage"]}"/>')
    a(f'<text x="995" y="556" class="m" font-size="14" font-weight="700" fill="{c["on_accent"]}" text-anchor="middle">v2 issued · 626caedd · ea0a575c</text>')
    a("</g></g>")

    a("</g>")  # scene

    a(
        f'<text x="600" y="608" class="m ink3" font-size="15" text-anchor="middle">'
        "Deployed run, 2026-10-16 · FalkorDB 6.0.2 · nvidia/nemotron-3-super-120b-a12b · 2 tool calls · 6.4 s</text>"
    )
    a("</svg>")
    return "\n".join(parts) + "\n"


# Percentages of one 10 s loop. Each element's base style is its final state; these
# keyframes only run under prefers-reduced-motion: no-preference.
#   4-14   B09-B11 move South -> Pilot           18-26  the finding reverses
#   28-44  the ripple reaches the three uses      46-56  REVIEWED_BY moves Noor -> Sam
#   58-66  Noor's release is refused              70-79  Sam approves; v2 issued
#   94-100 fade out, reset while invisible
ANIMATION = f"""
@media (prefers-reduced-motion:no-preference){{
#scene,#chips,#sOld,#sNew,#pOld,#pNew,#fOld,#fNew,#mOld,#mNew,#ring,#p1,#p2,#p3,
#t1o,#t1n,#t2o,#t2n,#t3o,#t3n,#eNoor,#eSam,#samRing,#noorOld,#noorNew,#samNew,#b5,#stamp,#b6,#pill,
#n1,#n2,#n3,#n4{{animation-duration:LOOP;animation-iteration-count:infinite;animation-timing-function:ease-in-out}}
#stamp,#pill,#ring{{transform-box:fill-box;transform-origin:center}}
#scene{{animation-name:scene}}
@keyframes scene{{0%{{opacity:0}}3%,94%{{opacity:1}}99%,100%{{opacity:0}}}}
#chips{{animation-name:chips}}
@keyframes chips{{0%,4%{{transform:translateY(-{LANE_SHIFT}px)}}14%,99%{{transform:none}}100%{{transform:translateY(-{LANE_SHIFT}px)}}}}
#sOld,#pOld{{animation-name:outB}}#sNew,#pNew{{animation-name:inB}}
@keyframes outB{{0%,12%{{opacity:1}}16%,99%{{opacity:0}}100%{{opacity:1}}}}
@keyframes inB{{0%,12%{{opacity:0}}16%,99%{{opacity:1}}100%{{opacity:0}}}}
#fOld,#mOld{{animation-name:flipOut}}#fNew,#mNew{{animation-name:flipIn}}
@keyframes flipOut{{0%,18%{{opacity:1;transform:none}}23%,99%{{opacity:0;transform:translateY(-14px)}}100%{{opacity:1;transform:none}}}}
@keyframes flipIn{{0%,20%{{opacity:0;transform:translateY(14px)}}26%,99%{{opacity:1;transform:none}}100%{{opacity:0;transform:translateY(14px)}}}}
#ring{{animation-name:ring}}
@keyframes ring{{0%,27%{{opacity:0;transform:scale(1)}}29%{{opacity:.8}}42%,100%{{opacity:0;transform:scale(2.1)}}}}
#p1,#p2,#p3{{animation-name:pulse}}#p2{{animation-delay:.25s}}#p3{{animation-delay:.5s}}
@keyframes pulse{{0%,28%{{opacity:0;stroke-dashoffset:.35}}29%{{opacity:1}}37%{{opacity:1;stroke-dashoffset:-1}}38%,100%{{opacity:0;stroke-dashoffset:-1}}}}
#t1o{{animation-name:o1}}#t1n{{animation-name:i1}}#t2o{{animation-name:o2}}#t2n{{animation-name:i2}}#t3o{{animation-name:o3}}#t3n{{animation-name:i3}}
@keyframes o1{{0%,36%{{opacity:1}}38%,99%{{opacity:0}}100%{{opacity:1}}}}@keyframes i1{{0%,36%{{opacity:0}}38%,99%{{opacity:1}}100%{{opacity:0}}}}
@keyframes o2{{0%,39%{{opacity:1}}41%,99%{{opacity:0}}100%{{opacity:1}}}}@keyframes i2{{0%,39%{{opacity:0}}41%,99%{{opacity:1}}100%{{opacity:0}}}}
@keyframes o3{{0%,42%{{opacity:1}}44%,99%{{opacity:0}}100%{{opacity:1}}}}@keyframes i3{{0%,42%{{opacity:0}}44%,99%{{opacity:1}}100%{{opacity:0}}}}
#eNoor{{animation-name:eNoor}}
@keyframes eNoor{{0%,46%{{opacity:1;stroke-dasharray:none;stroke:{'{amber}'}}}52%,99%{{opacity:.55}}100%{{opacity:1;stroke-dasharray:none}}}}
#eSam{{animation-name:eSam}}
@keyframes eSam{{0%,50%{{stroke-dashoffset:1}}56%,99%{{stroke-dashoffset:0}}100%{{stroke-dashoffset:1}}}}
#samRing,#samNew{{animation-name:samOn}}#noorNew{{animation-name:samOn}}#noorOld{{animation-name:noorOff}}
@keyframes samOn{{0%,52%{{opacity:0}}56%,99%{{opacity:1}}100%{{opacity:0}}}}
@keyframes noorOff{{0%,50%{{opacity:1}}54%,99%{{opacity:0}}100%{{opacity:1}}}}
#b5{{animation-name:b5}}
@keyframes b5{{0%,57%{{opacity:.25}}60%,99%{{opacity:1}}100%{{opacity:.25}}}}
#stamp{{animation-name:stamp}}
@keyframes stamp{{0%,61%{{opacity:0;transform:scale(1.5)}}64%{{opacity:1;transform:scale(.96)}}66%,99%{{opacity:1;transform:none}}100%{{opacity:0;transform:scale(1.5)}}}}
#b6{{animation-name:b6}}
@keyframes b6{{0%,69%{{opacity:.25}}72%,99%{{opacity:1}}100%{{opacity:.25}}}}
#pill{{animation-name:pill}}
@keyframes pill{{0%,74%{{opacity:0;transform:scale(.8)}}78%{{opacity:1;transform:scale(1.04)}}80%,99%{{opacity:1;transform:none}}100%{{opacity:0;transform:scale(.8)}}}}
#n1,#n2,#n3,#n4{{animation-name:step}}
#n1{{animation-delay:0s}}#n2{{animation-delay:1.6s}}#n3{{animation-delay:2.8s}}#n4{{animation-delay:4.6s}}
@keyframes step{{0%{{fill:{'{amber}'}}}12%,100%{{fill:{'{ink3}'}}}}}
}}
"""


def build() -> dict[str, int]:
    sizes = {}
    for name, palette, animated in (
        ("hero-dark.svg", PALETTES["dark"], True),
        ("hero-light.svg", PALETTES["light"], True),
        ("hero-static.svg", PALETTES["light"], False),
    ):
        text = svg(palette, animated)
        for key, value in palette.items():
            text = text.replace("{" + key + "}", value)
        (OUT / name).write_text(text, encoding="utf-8", newline="\n")
        sizes[name] = len(text.encode("utf-8"))
    return sizes


if __name__ == "__main__":
    for name, size in build().items():
        print(f"{name}: {size} bytes")

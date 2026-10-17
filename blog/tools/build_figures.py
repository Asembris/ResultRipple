"""Build the static fallback figures in blog/assets/figures/ from blog/data/story.json.

They stand in for the three WebGL scenes when JavaScript or WebGL is off, so they
follow the same rule: every node, edge, label and figure comes from the story.
Positions mirror the layout in blog/assets/js/graph-core.js (presentation only).

    python blog/tools/build_figures.py           # write the SVGs
    python blog/tools/build_figures.py --check   # fail if a committed SVG differs
"""

from __future__ import annotations

import argparse
import json
import sys
from html import escape
from pathlib import Path

BLOG = Path(__file__).resolve().parents[1]
STORY = BLOG / "data" / "story.json"
OUT = BLOG / "assets" / "figures"

C = {"bg": "#080706", "ivory": "#EFE8DA", "ink2": "#C4BBAC", "ink3": "#948B7D", "sub": "#A39A8C", "amber": "#E8B064",
     "coral": "#E3876A", "sage": "#9CCBAE", "dim": "#6A6257", "faint": "#5A5144"}
SERIF = "Georgia, 'Times New Roman', serif"
SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"

# mirrors graph-core.js
FIXED = {"comparison": (-2.2, 1.8), "finding": (1.6, 1.8), "decision": (8.6, -2.9), "team": (10.8, -4.6)}
DOC_POS = [(5.2, 4.6), (5.2, -1.2)]
PERSON_POS = [(14.2, -2.2), (14.2, -6.4)]
PLAN_POS = [(11.4, 2.8), (11.6, 0.5)]
RELATION_DIR = {"HIGHER_COST": "higher", "LOWER_COST": "lower", "EQUAL_COST": "equal"}
RELATION_WORD = {"HIGHER_COST": "more expensive", "LOWER_COST": "cheaper", "EQUAL_COST": "equal"}
STATUS = {"PROPOSED": "proposed", "RETURNED_FOR_REVIEW": "returned for review"}


def money(cents: int) -> str:
    return f"${cents // 100}.{cents % 100:02d}"


def short(h: str) -> str:
    return f"{h[:8]}…{h[-4:]}"


def positions(story: dict, phase: str) -> dict[str, tuple[float, float]]:
    lanes = {lane["id"]: (-6.0, 3.6 - i * 3.6) for i, lane in enumerate(story["lanes"])}
    key = "lane_before" if phase == "before" else "lane_after"
    pos: dict[str, tuple[float, float]] = dict(lanes)
    for lid, (lx, ly) in lanes.items():
        group = sorted(b["id"] for b in story["batches"] if b[key] == lid)
        n = len(group)
        for j, bid in enumerate(group):
            off = (j - (n - 1) / 2) * 0.56
            pos[bid] = (lx - 2.8 + abs(off) * 0.22, ly + off)
    d = p = pl = 0
    for node in story["graph"]["nodes"]:
        t = node["type"]
        if t == "document":
            pos[node["id"]] = DOC_POS[d]; d += 1
        elif t == "person":
            pos[node["id"]] = PERSON_POS[p]; p += 1
        elif t == "plan":
            pos[node["id"]] = PLAN_POS[pl]; pl += 1
        elif t in FIXED:
            pos[node["id"]] = FIXED[t]
    return pos


class Svg:
    def __init__(self, box: tuple[float, float, float, float], width: int, title: str, desc: str):
        self.x0, self.y0, self.x1, self.y1 = box
        self.s = width / (self.x1 - self.x0)
        self.w = width
        self.h = round((self.y1 - self.y0) * self.s)
        self.parts: list[str] = []
        self.title, self.desc = title, desc

    def p(self, x: float, y: float) -> tuple[float, float]:
        return round((x - self.x0) * self.s, 1), round((self.y1 - y) * self.s, 1)

    def edge(self, a, b, color, op=0.6, width=1.6, dash=False, bend=0.0):
        (ax, ay), (bx, by) = self.p(*a), self.p(*b)
        mx, my = (ax + bx) / 2, (ay + by) / 2
        dx, dy = bx - ax, by - ay
        cx, cy = round(mx - dy * bend, 1), round(my + dx * bend, 1)
        extra = ' stroke-dasharray="5 5"' if dash else ""
        self.parts.append(f'<path d="M{ax} {ay}Q{cx} {cy} {bx} {by}" fill="none" stroke="{color}" stroke-opacity="{op}" stroke-width="{width}"{extra}/>')

    def node(self, xy, kind, color, r=7.0):
        x, y = self.p(*xy)
        glow = f'<circle cx="{x}" cy="{y}" r="{r * 3.2:.1f}" fill="{color}" fill-opacity=".09"/>'
        if kind == "doc":
            shape = f'<rect x="{x - 8}" y="{y - 11}" width="16" height="22" fill="{color}" fill-opacity=".9" stroke="{color}"/>'
            shape += "".join(f'<rect x="{x - 5}" y="{y - 7 + i * 4.5}" width="{6 if i == 1 else 10}" height="1.4" fill="{C["bg"]}"/>' for i in range(4))
        elif kind == "diamond":
            shape = f'<path d="M{x} {y - r * 1.3}L{x + r * 1.3} {y}L{x} {y + r * 1.3}L{x - r * 1.3} {y}Z" fill="{color}"/>'
        elif kind == "person":
            shape = f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="{color}" stroke-width="2"/><circle cx="{x}" cy="{y}" r="2.6" fill="{color}"/>'
        elif kind == "ring":
            shape = (f'<ellipse cx="{x}" cy="{y}" rx="{r * 1.9:.1f}" ry="{r * 0.55:.1f}" fill="none" stroke="{color}" stroke-opacity=".55"/>'
                     f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>')
        else:
            shape = f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>'
        self.parts.append(glow + shape)

    def text(self, xy, s, *, dx=0, dy=0, anchor="start", size=13, font=SANS, color=None, weight=400, strike=False, ls=0):
        x, y = self.p(*xy)
        deco = ' text-decoration="line-through"' if strike else ""
        spacing = f' letter-spacing="{ls}"' if ls else ""
        self.parts.append(f'<text x="{round(x + dx, 1)}" y="{round(y + dy, 1)}" text-anchor="{anchor}" font-family="{escape(font, quote=True)}" '
                          f'font-size="{size}" font-weight="{weight}" fill="{color or C["ivory"]}"{deco}{spacing}>{escape(s)}</text>')

    def tag(self, xy, s, color, *, dx=0, dy=0, anchor="start"):
        x, y = self.p(*xy)
        w = len(s) * 6.6 + 12
        left = x + dx - (w / 2 if anchor == "middle" else w if anchor == "end" else 0)
        top = y + dy
        self.parts.append(f'<rect x="{round(left, 1)}" y="{round(top, 1)}" width="{round(w, 1)}" height="17" rx="2" fill="{color}" fill-opacity=".08" stroke="{color}" stroke-opacity=".5"/>'
                          f'<text x="{round(left + w / 2, 1)}" y="{round(top + 12, 1)}" text-anchor="middle" font-family="{escape(MONO, quote=True)}" font-size="10.5" font-weight="600" letter-spacing=".8" fill="{color}">{escape(s)}</text>')

    def render(self) -> str:
        cx, cy = self.p(1.6, 1.8)
        rings = "".join(f'<circle cx="{cx}" cy="{cy}" r="{round(i * 3.2 * self.s)}" fill="none" stroke="{C["amber"]}" stroke-opacity="{0.05 - i * 0.005:.3f}"/>' for i in range(1, 7))
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}" role="img" aria-labelledby="t d">\n'
                f'<title id="t">{escape(self.title)}</title>\n<desc id="d">{escape(self.desc)}</desc>\n'
                f'{rings}\n' + "\n".join(self.parts) + "\n</svg>\n")


def lane_sub(story, lane_id, phase):
    c = story["comparison"][phase]
    if lane_id == story["comparison"]["left_lane"]:
        return f"{money(c['left']['mean_cents'])} mean · {c['left']['count']} batches"
    if lane_id == story["comparison"]["right_lane"]:
        return f"{money(c['right']['mean_cents'])} mean · {c['right']['count']} batches"
    key = "lane_before" if phase == "before" else "lane_after"
    return f"{sum(1 for b in story['batches'] if b[key] == lane_id)} batches · not compared"


def ids(story):
    by = lambda t: [n["id"] for n in story["graph"]["nodes"] if n["type"] == t]  # noqa: E731
    return {"team": by("team")[0], "comparison": story["comparison"]["id"], "finding": story["finding"]["id"],
            "docs": [d["id"] for d in story["documents"]], "decision": story["decision"]["id"],
            "before": story["authority"]["before_id"], "after": story["authority"]["after_id"],
            "plan1": story["plans"][0]["id"], "plan2": story["plans"][1]["id"],
            "moved": set(story["correction"]["moved"]), "right": story["comparison"]["right_lane"],
            "left": story["comparison"]["left_lane"], "to": story["correction"]["to_lane"], "from": story["correction"]["from_lane"]}


def draw_evidence(svg, story, I, pos, before_pos, *, show_moves, batch_labels, highlight, show_before_figures):
    right_name = next(l["name"] for l in story["lanes"] if l["id"] == I["right"])
    for e in story["graph"]["edges"]:
        if e["rel"] != "ASSIGNED_TO":
            continue
        if e["phase"] == "before" and show_moves:
            svg.edge(before_pos[e["from"]], pos[e["to"]], C["coral"], 0.5, 1.0, dash=True)
        elif e["phase"] in ("after", "both"):
            mv = e["from"] in I["moved"]
            svg.edge(pos[e["from"]], pos[e["to"]], C["amber"] if mv else C["faint"], 0.7 if mv else 0.5, 1.0)
    for b in story["batches"]:
        mv = b["id"] in I["moved"]
        if show_moves and mv:
            x, y = before_pos[b["id"]]
            svg.node((x, y), "dot", C["coral"], 2.4)
        svg.node(pos[b["id"]], "dot", C["amber"] if mv else C["ivory"], 3.6)
        if batch_labels:
            svg.text(pos[b["id"]], b["id"], dx=-9, dy=4, anchor="end", size=10.5, font=MONO, color=C["sub"])
    for lane in story["lanes"]:
        lx, ly = pos[lane["id"]]
        changed = lane["id"] == I["right"] and highlight
        svg.node((lx, ly), "ring", C["coral"] if changed else C["ivory"], 7)
        svg.text((lx - 4.3, ly), lane["name"], dy=2, anchor="end", size=22, font=SERIF)
        sub = lane_sub(story, lane["id"], "after")
        if show_before_figures and lane["id"] == I["right"]:
            svg.text((lx - 4.3, ly), "was " + lane_sub(story, lane["id"], "before"), dy=34, anchor="end", size=10.5, font=MONO, color=C["coral"], strike=True)
        svg.text((lx - 4.3, ly), sub, dy=18, anchor="end", size=10.5, font=MONO, color=C["coral"] if changed else C["sub"])
    return right_name


def figure_ripple(story) -> str:
    I = ids(story)
    pos, before_pos = positions(story, "after"), positions(story, "before")
    c0, c1 = story["comparison"]["before"], story["comparison"]["after"]
    D = story["display"]
    svg = Svg((-14.8, -6.2, 11.4, 6.6), 1200,
              "The ripple: three memberships move and every registered use of the finding is out of date",
              f"{D['correction.moved_list']} move from {D['lane.from']} to {D['lane.to']}. {D['lane.from']} goes from {D['south.before.mean']} over "
              f"{D['south.before.n']} batches to {D['south.after.mean']} over {D['south.after.n']}; North stays at {D['north.mean']}. "
              f"The shared finding goes from {D['finding.before']} to {D['finding.after']}, and both reports and the proposal are out of date.")
    svg.edge(pos[I["comparison"]], pos[I["left"]], C["amber"], 0.5, 1.6, bend=0.08)
    svg.edge(pos[I["comparison"]], pos[I["right"]], C["coral"], 0.7, 1.8, bend=-0.08)
    svg.edge(pos[I["finding"]], pos[I["comparison"]], C["coral"], 0.7, 1.8)
    for d in I["docs"]:
        svg.edge(pos[I["finding"]], pos[d], C["coral"], 0.7, 1.8, bend=0.06)
    svg.edge(pos[I["decision"]], pos[I["finding"]], C["coral"], 0.7, 1.8, bend=-0.05)
    right = draw_evidence(svg, story, I, pos, before_pos, show_moves=True, batch_labels=True, highlight=True, show_before_figures=True)
    cx, cy = pos[I["comparison"]]
    svg.node((cx, cy), "ring", C["coral"], 10)
    svg.text((cx, cy), "Cost comparison", dy=34, anchor="middle", size=19, font=SERIF)
    svg.text((cx, cy), f"{right} {RELATION_DIR[c0['relation']]} by {c0['magnitude_cents']}¢", dy=52, anchor="middle", size=10.5, font=MONO, color=C["ink3"], strike=True)
    svg.text((cx, cy), f"{right} {RELATION_DIR[c1['relation']]} by {c1['magnitude_cents']}¢", dy=67, anchor="middle", size=11, font=MONO, color=C["coral"])
    svg.tag((cx, cy), "DIRECTION REVERSED", C["coral"], dy=74, anchor="middle")
    fx, fy = pos[I["finding"]]
    svg.node((fx, fy), "ring", C["coral"], 13)
    svg.text((fx, fy), "Shared finding", dy=42, anchor="middle", size=19, font=SERIF)
    svg.text((fx, fy), D["finding.before"], dy=60, anchor="middle", size=10.5, font=MONO, color=C["ink3"], strike=True)
    svg.text((fx, fy), D["finding.after"], dy=75, anchor="middle", size=11, font=MONO, color=C["coral"])
    svg.tag((fx, fy), "PUBLISHED TEXT CONTRADICTED", C["coral"], dy=82, anchor="middle")
    for d in story["documents"]:
        svg.node(pos[d["id"]], "doc", C["coral"])
        svg.text(pos[d["id"]], d["title"], dy=34, anchor="middle", size=17, font=SERIF)
        svg.text(pos[d["id"]], "owner " + d["owner"] + " · Version 1", dy=50, anchor="middle", size=10.5, font=MONO, color=C["sub"])
        svg.tag(pos[d["id"]], "OUT OF DATE", C["coral"], dy=57, anchor="middle")
    svg.node(pos[I["decision"]], "diamond", C["coral"], 9)
    svg.text(pos[I["decision"]], story["decision"]["title"], dy=32, anchor="middle", size=17, font=SERIF)
    svg.text(pos[I["decision"]], STATUS[story["decision"]["status_before"]], dy=48, anchor="middle", size=10.5, font=MONO, color=C["sub"])
    svg.tag(pos[I["decision"]], "BASIS CONTRADICTED", C["coral"], dy=55, anchor="middle")
    return svg.render()


def figure_authority(story) -> str:
    I = ids(story)
    pos = positions(story, "after")
    A, (p1, p2) = story["authority"], story["plans"]
    svg = Svg((6.4, -7.6, 19.0, 4.4), 1000,
              "Authority is an edge: REVIEWED_BY moves and plan v1's approval stops counting",
              f"The {A['team']} REVIEWED_BY edge moves from {A['before']} to {A['after']}. Plan v1, approved by {p1['approved_by']}, is refused with "
              f"{story['refusal']['code']}. Plan v2 has the same content hash {short(p1['content_hash'])} and a new fingerprint "
              f"{short(p2['execution_fingerprint'])}, and is approved by {p2['approved_by']}.")
    svg.edge(pos[I["decision"]], pos[I["team"]], C["faint"], 0.6, 1.2)
    svg.edge(pos[I["team"]], pos[I["before"]], C["coral"], 0.6, 1.6, dash=True, bend=-0.1)
    svg.edge(pos[I["team"]], pos[I["after"]], C["ivory"], 0.6, 1.8, bend=0.1)
    svg.edge(pos[I["plan1"]], pos[I["before"]], C["coral"], 0.6, 1.6, dash=True, bend=-0.12)
    svg.edge(pos[I["plan2"]], pos[I["after"]], C["sage"], 0.7, 1.8, bend=0.1)
    svg.node(pos[I["decision"]], "diamond", C["amber"], 9)
    svg.text(pos[I["decision"]], story["decision"]["title"], dy=32, anchor="middle", size=17, font=SERIF)
    svg.text(pos[I["decision"]], "owned by " + A["team"], dy=48, anchor="middle", size=10.5, font=MONO, color=C["sub"])
    svg.node(pos[I["team"]], "dot", C["ivory"], 7)
    svg.text(pos[I["team"]], A["team"], dy=28, anchor="middle", size=13, weight=500)
    svg.text(pos[I["team"]], "review rota", dy=44, anchor="middle", size=10.5, font=MONO, color=C["sub"])
    tx, ty = pos[I["team"]]
    svg.text(((tx + pos[I["before"]][0]) / 2, (ty + pos[I["before"]][1]) / 2), "REVIEWED_BY", dx=-8, dy=-6, anchor="end", size=10, font=MONO, color=C["coral"], strike=True)
    svg.text(((tx + pos[I["after"]][0]) / 2, (ty + pos[I["after"]][1]) / 2), "REVIEWED_BY", dy=18, anchor="middle", size=10, font=MONO, color=C["ink3"])
    svg.node(pos[I["before"]], "person", C["dim"], 9)
    svg.text(pos[I["before"]], A["before"], dx=18, dy=-2, size=13, weight=500)
    svg.text(pos[I["before"]], "reviewer · no current authority", dx=18, dy=14, size=10.5, font=MONO, color=C["sub"])
    svg.node(pos[I["after"]], "person", C["amber"], 9)
    svg.text(pos[I["after"]], A["after"], dx=18, dy=-2, size=13, weight=500)
    svg.text(pos[I["after"]], "reviewer · current reviewer", dx=18, dy=14, size=10.5, font=MONO, color=C["sub"])
    svg.tag(pos[I["after"]], "★ REVIEW AUTHORITY", C["amber"], dx=18, dy=20)
    for p, color, head, tag in ((p1, C["coral"], "approved by " + p1["approved_by"] + " · no longer valid", story["refusal"]["code"]),
                                (p2, C["sage"], "approved by " + p2["approved_by"], "APPROVED · " + p2["approved_by"].upper())):
        xy = pos[p["id"]]
        svg.node(xy, "diamond", color, 7)
        svg.text(xy, f"Review plan v{p['version']}", dx=16, dy=-26, size=13, weight=500)
        svg.text(xy, head, dx=16, dy=-11, size=10.5, font=MONO, color=C["sub"])
        svg.text(xy, "content " + short(p["content_hash"]), dx=16, dy=3, size=10.5, font=MONO, color=C["sub"])
        svg.text(xy, "fingerprint " + short(p["execution_fingerprint"]), dx=16, dy=17, size=10.5, font=MONO, color=C["ivory"])
        svg.tag(xy, tag, color, dx=16, dy=23)
    return svg.render()


def figure_hero(story) -> str:
    I = ids(story)
    pos = positions(story, "after")
    D = story["display"]
    p1, p2 = story["plans"]
    svg = Svg((-14.4, -7.4, 18.2, 6.2), 1400,
              "The evidence graph as the recorded run left it",
              f"Batches in their corrected lanes, the shared finding ({D['finding.after']}), both corrected reports, the proposal "
              f"{STATUS[story['decision']['status_after']]}, review authority with {story['authority']['after']}, plan v1 refused with "
              f"{story['refusal']['code']} and plan v2 approved.")
    svg.edge(pos[I["comparison"]], pos[I["left"]], C["amber"], 0.5, 1.4, bend=0.08)
    svg.edge(pos[I["comparison"]], pos[I["right"]], C["amber"], 0.5, 1.4, bend=-0.08)
    svg.edge(pos[I["finding"]], pos[I["comparison"]], C["amber"], 0.6, 1.6)
    for d in I["docs"]:
        svg.edge(pos[I["finding"]], pos[d], C["amber"], 0.6, 1.6, bend=0.06)
    svg.edge(pos[I["decision"]], pos[I["finding"]], C["amber"], 0.6, 1.6, bend=-0.05)
    svg.edge(pos[I["decision"]], pos[I["team"]], C["faint"], 0.6, 1.2)
    svg.edge(pos[I["team"]], pos[I["after"]], C["ivory"], 0.5, 1.4, bend=0.1)
    svg.edge(pos[I["plan1"]], pos[I["before"]], C["coral"], 0.6, 1.4, dash=True, bend=-0.12)
    svg.edge(pos[I["plan2"]], pos[I["after"]], C["sage"], 0.6, 1.4, bend=0.1)
    draw_evidence(svg, story, I, pos, pos, show_moves=False, batch_labels=False, highlight=False, show_before_figures=False)
    for k, title, sub in (("comparison", "Cost comparison", None), ("finding", "Shared finding", D["finding.after"])):
        svg.node(pos[I[k]], "ring", C["amber"], 10 if k == "comparison" else 13)
        svg.text(pos[I[k]], title, dy=38, anchor="middle", size=19, font=SERIF)
        if sub:
            svg.text(pos[I[k]], sub, dy=55, anchor="middle", size=10.5, font=MONO, color=C["sub"])
    for d in story["documents"]:
        svg.node(pos[d["id"]], "doc", C["sage"])
        svg.text(pos[d["id"]], d["title"], dy=34, anchor="middle", size=17, font=SERIF)
        svg.tag(pos[d["id"]], "CORRECTED", C["sage"], dy=42, anchor="middle")
    svg.node(pos[I["decision"]], "diamond", C["amber"], 9)
    svg.text(pos[I["decision"]], story["decision"]["title"], dy=32, anchor="middle", size=17, font=SERIF)
    svg.text(pos[I["decision"]], STATUS[story["decision"]["status_after"]], dy=48, anchor="middle", size=10.5, font=MONO, color=C["sub"])
    svg.node(pos[I["team"]], "dot", C["ivory"], 7)
    svg.node(pos[I["before"]], "person", C["dim"], 9)
    svg.text(pos[I["before"]], story["authority"]["before"], dx=18, dy=4, size=13, weight=500)
    svg.node(pos[I["after"]], "person", C["amber"], 9)
    svg.text(pos[I["after"]], story["authority"]["after"], dx=18, dy=4, size=13, weight=500)
    svg.node(pos[I["plan1"]], "diamond", C["coral"], 7)
    svg.tag(pos[I["plan1"]], story["refusal"]["code"], C["coral"], dx=16, dy=-8)
    svg.node(pos[I["plan2"]], "diamond", C["sage"], 7)
    svg.tag(pos[I["plan2"]], "APPROVED · " + p2["approved_by"].upper(), C["sage"], dx=16, dy=-8)
    return svg.render()


FIGURES = {"hero.svg": figure_hero, "ripple.svg": figure_ripple, "authority.svg": figure_authority}


def render_all() -> dict[str, str]:
    story = json.loads(STORY.read_text(encoding="utf-8"))
    return {name: fn(story) for name, fn in FIGURES.items()}


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the static fallback figures from story.json.")
    parser.add_argument("--check", action="store_true")
    opts = parser.parse_args()
    figures = render_all()
    if opts.check:
        stale = [n for n, text in figures.items() if not (OUT / n).exists() or (OUT / n).read_text(encoding="utf-8") != text]
        if stale:
            print("build_figures: out of date: " + ", ".join(stale) + " (run python blog/tools/build_figures.py)", file=sys.stderr)
            return 1
        print(f"build_figures: {len(figures)} figures match blog/data/story.json")
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    for name, text in figures.items():
        (OUT / name).write_text(text, encoding="utf-8", newline="\n")
        print(f"build_figures: wrote blog/assets/figures/{name} ({len(text.encode())} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

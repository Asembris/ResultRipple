"""Checks for the write-up in blog/. Exit status 0 only if every check passes.

    python blog/tools/check.py

1. blog/data/story.json is exactly what docs/evidence produces.
2. index.html parses cleanly: balanced tags, unique ids, every #fragment resolves.
3. Every local link and asset (HTML, CSS url(), JS imports, the import map) exists.
4. Nothing references a remote URL except an <a href> on the allowlist.
5. Every data-fact element says exactly what story.json says.
6. Every hash and release id written in the page appears in story.json.
7. The screenshots are byte-identical to docs/evidence/screens.
8. Links into this repository point at files that exist; commit links at real commits.
9. The relationship names the scenes draw exist in docs/graph-model.md.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

TOOLS = Path(__file__).resolve().parent
BLOG = TOOLS.parent
ROOT = BLOG.parent
sys.path.insert(0, str(TOOLS))

import extract_story  # noqa: E402

REPO_URL = "https://github.com/Asembris/ResultRipple"
ALLOWED_LINKS = (
    re.compile(r"^https://52-58-115-104\.sslip\.io(/[A-Za-z0-9/_.-]*)?$"),
    re.compile(r"^https://github\.com/Asembris/ResultRipple(/[A-Za-z0-9/_.-]*)?(#[a-z0-9-]+)?$"),
    re.compile(r"^https://youtu\.be/rnEBSMolZmA$"),
)
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
URL_ATTRS = {"href", "src", "poster", "data-src"}
REMOTE = re.compile(r"(?:https?:)?//[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


class Report:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.passes: list[str] = []

    def check(self, name: str, problems: list[str], detail: str = "") -> None:
        if problems:
            self.failures.append(name)
            print(f"FAIL  {name}")
            for p in problems[:25]:
                print(f"      - {p}")
            if len(problems) > 25:
                print(f"      … and {len(problems) - 25} more")
        else:
            self.passes.append(name)
            print(f"ok    {name}{(' · ' + detail) if detail else ''}")


class Page(HTMLParser):
    """Collects structure, URLs, ids and data-fact text from one HTML file."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, int]] = []
        self.problems: list[str] = []
        self.ids: dict[str, int] = {}
        self.urls: list[tuple[str, str, str, int]] = []  # (tag, attr, value, line)
        self.facts: list[dict] = []
        self.texts: list[str] = []
        self.scripts: list[dict] = []
        self.styles: list[str] = []
        self._fact_depth: list[int] = []
        self._script: dict | None = None
        self._style = False

    def handle_starttag(self, tag, attrs):
        line = self.getpos()[0]
        a = dict(attrs)
        if "id" in a:
            if a["id"] in self.ids:
                self.problems.append(f"line {line}: duplicate id {a['id']!r}")
            self.ids[a["id"]] = line
        for k, v in attrs:
            if k in URL_ATTRS and v is not None:
                self.urls.append((tag, k, v, line))
            if k == "srcset" and v:
                for part in v.split(","):
                    self.urls.append((tag, k, part.strip().split(" ")[0], line))
            if k == "style" and v:
                self.styles.append(v)
        if tag == "script":
            self._script = {"attrs": a, "text": "", "line": line}
        if tag == "style":
            self._style = True
        if tag in VOID:
            return
        self.stack.append((tag, line))
        if "data-fact" in a:
            self.facts.append({"key": a["data-fact"], "text": "", "line": line, "depth": len(self.stack)})
            self._fact_depth.append(len(self.facts) - 1)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        line = self.getpos()[0]
        if tag in VOID:
            self.problems.append(f"line {line}: end tag for void element <{tag}>")
            return
        if not self.stack:
            self.problems.append(f"line {line}: stray </{tag}>")
            return
        open_tag, open_line = self.stack[-1]
        if open_tag != tag:
            self.problems.append(f"line {line}: </{tag}> closes <{open_tag}> opened on line {open_line}")
            # Recover: unwind to the matching tag if there is one.
            names = [t for t, _ in self.stack]
            if tag in names:
                while self.stack and self.stack[-1][0] != tag:
                    self.stack.pop()
            else:
                return
        depth = len(self.stack)
        self.stack.pop()
        while self._fact_depth and self.facts[self._fact_depth[-1]]["depth"] == depth:
            self._fact_depth.pop()
        if tag == "script" and self._script is not None:
            self.scripts.append(self._script)
            self._script = None
        if tag == "style":
            self._style = False

    def handle_data(self, data):
        if self._script is not None:
            self._script["text"] += data
            return
        if self._style:
            self.styles.append(data)
            return
        self.texts.append(data)
        for i in self._fact_depth:
            self.facts[i]["text"] += data

    def close(self):
        super().close()
        for tag, line in self.stack:
            if tag not in ("html", "body", "head"):
                self.problems.append(f"line {line}: <{tag}> is never closed")


def is_remote(url: str) -> bool:
    return bool(REMOTE.match(url)) or url.startswith(("http:", "https:", "//"))


def local_target(base: Path, url: str) -> Path | None:
    """The file a relative URL points at, or None for fragments, data: and mailto:."""
    if url.startswith(("#", "data:", "mailto:")) or not url:
        return None
    path = unquote(urlsplit(url).path)
    if not path:
        return None
    if path.startswith("/"):
        return (BLOG / path.lstrip("/")).resolve()
    target = (base.parent / path).resolve()
    if target.is_dir():
        target = target / "index.html"
    return target


def css_urls(text: str) -> list[str]:
    return [m.strip("'\" ") for m in re.findall(r"url\(([^)]+)\)", text)]


def js_imports(text: str) -> list[str]:
    found = re.findall(r"""(?:^|[\s;])import\s*(?:[^'"()]*?\s*from\s*)?['"]([^'"]+)['"]""", text, re.M)
    found += re.findall(r"""import\(\s*['"]([^'"]+)['"]\s*\)""", text)
    found += re.findall(r"""new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url""", text)
    found += re.findall(r"""fetch\(\s*(?:new URL\(\s*)?['"]([^'"]+)['"]""", text)
    return found


def own_js_files() -> list[Path]:
    return sorted(p for p in (BLOG / "assets" / "js").rglob("*.js") if "vendor" not in p.parts) if (BLOG / "assets" / "js").exists() else []


def main() -> int:
    r = Report()
    html_path = BLOG / "index.html"
    html = html_path.read_text(encoding="utf-8")

    # 1 · story.json
    try:
        expected = extract_story.render(extract_story.build())
        current = extract_story.OUT.read_text(encoding="utf-8") if extract_story.OUT.exists() else ""
        r.check("story.json matches docs/evidence", [] if current == expected else
                ["blog/data/story.json differs from what docs/evidence produces (run blog/tools/extract_story.py)"],
                f"{len(expected.encode())} bytes from {len(extract_story.USED_FILES)} evidence files")
    except extract_story.EvidenceError as exc:
        r.check("story.json matches docs/evidence", [f"evidence error: {exc}"])
        return 1
    story = json.loads(expected)
    display = story["display"]

    # 2 · HTML parses cleanly
    page = Page()
    page.feed(html)
    page.close()
    problems = list(page.problems)
    if not html.lstrip().lower().startswith("<!doctype html>"):
        problems.append("missing <!doctype html>")
    for tag, attr, url, line in page.urls:
        if url.startswith("#") and len(url) > 1 and url[1:] not in page.ids:
            problems.append(f"line {line}: {attr}={url!r} points at no element")
    for tag, attr, url, line in page.urls:
        if tag == "img" and attr == "src":
            pass
    imgs_without_alt = re.findall(r"<img(?![^>]*\balt=)[^>]*>", html)
    problems += [f"<img> without alt: {m[:60]}" for m in imgs_without_alt]
    r.check("index.html parses cleanly", problems, f"{len(page.ids)} ids, {len(page.urls)} URLs, no unclosed or mismatched tags")

    # 3 · local links and assets
    missing: list[str] = []
    local_count = 0
    for tag, attr, url, line in page.urls:
        if is_remote(url):
            continue
        target = local_target(html_path, url)
        if target is None:
            continue
        local_count += 1
        if not target.is_file() or BLOG.resolve() not in target.parents:
            missing.append(f"index.html line {line}: {tag}[{attr}]={url!r}")
    import_maps = [s for s in page.scripts if s["attrs"].get("type") == "importmap"]
    for s in import_maps:
        for spec, url in json.loads(s["text"]).get("imports", {}).items():
            target = local_target(html_path, url)
            local_count += 1
            if is_remote(url) or target is None or not target.is_file():
                missing.append(f"import map {spec!r} -> {url!r}")
    for css in sorted((BLOG / "assets").rglob("*.css")):
        for url in css_urls(css.read_text(encoding="utf-8")):
            if is_remote(url):
                continue
            target = local_target(css, url)
            if target is not None:
                local_count += 1
                if not target.is_file():
                    missing.append(f"{css.relative_to(BLOG).as_posix()}: url({url})")
    bare = {spec for s in import_maps for spec in json.loads(s["text"]).get("imports", {})}
    for js in own_js_files():
        for spec in js_imports(js.read_text(encoding="utf-8")):
            if spec in bare:
                continue
            target = local_target(js, spec)
            local_count += 1
            if is_remote(spec) or target is None or not target.is_file():
                missing.append(f"{js.relative_to(BLOG).as_posix()}: import {spec!r}")
    r.check("every local link and asset exists", missing, f"{local_count} local references")

    # 4 · remote URLs
    remote_problems: list[str] = []
    remote_links = 0
    for tag, attr, url, line in page.urls:
        if not is_remote(url):
            continue
        if tag == "a" and attr == "href":
            remote_links += 1
            if not any(p.match(url) for p in ALLOWED_LINKS):
                remote_problems.append(f"line {line}: link to {url} is not on the allowlist")
        elif tag == "meta":
            remote_problems.append(f"line {line}: <meta> points at remote {url}")
        else:
            remote_problems.append(f"line {line}: <{tag} {attr}> loads remote {url}")
    for s in page.scripts:
        if "src" in s["attrs"] and is_remote(s["attrs"]["src"]):
            remote_problems.append(f"line {s['line']}: script loads {s['attrs']['src']}")
        if REMOTE.search(s["text"]):
            remote_problems.append(f"line {s['line']}: inline script mentions a remote URL")
    for style in page.styles:
        if REMOTE.search(style):
            remote_problems.append("inline style mentions a remote URL")
    for css in sorted((BLOG / "assets").rglob("*.css")):
        if REMOTE.search(css.read_text(encoding="utf-8")):
            remote_problems.append(f"{css.relative_to(BLOG).as_posix()} mentions a remote URL")
    for js in own_js_files():
        if REMOTE.search(js.read_text(encoding="utf-8")):
            remote_problems.append(f"{js.relative_to(BLOG).as_posix()} mentions a remote URL")
    if re.search(r"<iframe\b", html, re.I):
        remote_problems.append("the page embeds an <iframe>")
    r.check("no remote references outside the allowed links", remote_problems,
            f"{remote_links} outbound links, all allowlisted; nothing remote is loaded")

    # 5 · data-fact bindings
    fact_problems = []
    for f in page.facts:
        want = display.get(f["key"])
        got = " ".join(f["text"].split())
        if want is None:
            fact_problems.append(f"line {f['line']}: data-fact={f['key']!r} is not in story.json")
        elif got != want:
            fact_problems.append(f"line {f['line']}: data-fact={f['key']!r} says {got!r}, story.json says {want!r}")
    r.check("every data-fact matches story.json", fact_problems, f"{len(page.facts)} bound figures and sentences")

    # 6 · hashes and release ids written in the page
    blob = json.dumps(story, ensure_ascii=False)
    text = " ".join(page.texts)
    tokens = set(re.findall(r"\b[0-9a-f]{64}\b", text)) | set(re.findall(r"\brel-\d{3}-[0-9a-f]{8}\b", html))
    tokens |= set(re.findall(r"\bplan-case-[a-z0-9-]+-v\d\b", html))
    shorts = set(re.findall(r"\b([0-9a-f]{8})…([0-9a-f]{4})\b", text))
    token_problems = [f"{t} is not in story.json" for t in sorted(tokens) if t not in blob]
    full = re.findall(r"[0-9a-f]{64}", blob)
    for head, tail in sorted(shorts):
        if not any(h.startswith(head) and h.endswith(tail) for h in full):
            token_problems.append(f"{head}…{tail} abbreviates no hash in story.json")
    r.check("every hash and id in the page is in story.json", token_problems,
            f"{len(tokens)} full hashes and ids, {len(shorts)} abbreviated hashes")

    # 7 · screenshots
    shot_problems = []
    shots = sorted((BLOG / "assets" / "screens").glob("*"))
    for shot in shots:
        source = ROOT / "docs" / "evidence" / "screens" / shot.name
        if not source.is_file():
            shot_problems.append(f"{shot.name} has no source in docs/evidence/screens")
        elif hashlib.sha256(shot.read_bytes()).digest() != hashlib.sha256(source.read_bytes()).digest():
            shot_problems.append(f"{shot.name} differs from docs/evidence/screens/{shot.name}")
    r.check("screenshots are the evidence screenshots", shot_problems, f"{len(shots)} files byte-identical")

    # 8 · repository links
    repo_problems = []
    commits = set()
    for tag, attr, url, line in page.urls:
        if not url.startswith(REPO_URL + "/"):
            continue
        rest = url[len(REPO_URL) + 1:].split("#")[0]
        m = re.match(r"(?:blob|tree)/main/(.+)$", rest)
        if m:
            if not (ROOT / m.group(1)).exists():
                repo_problems.append(f"line {line}: {url} names a path that is not in the repository")
        elif rest.startswith("commit/"):
            commits.add(rest.split("/", 1)[1])
        else:
            repo_problems.append(f"line {line}: unexpected repository link {url}")
    shallow = subprocess.run(["git", "rev-parse", "--is-shallow-repository"], cwd=ROOT, capture_output=True, text=True)
    if shallow.returncode != 0 or shallow.stdout.strip() == "true":
        repo_problems.append("cannot verify commit links in a shallow or missing git checkout (use fetch-depth: 0)")
    else:
        for sha in sorted(commits):
            ok = subprocess.run(["git", "cat-file", "-e", f"{sha}^{{commit}}"], cwd=ROOT, capture_output=True)
            if ok.returncode != 0:
                repo_problems.append(f"commit {sha} does not exist")
    r.check("repository links resolve", repo_problems, f"{len(commits)} commits and every file path checked")

    # 9 · relationship names
    model = (ROOT / "docs" / "graph-model.md").read_text(encoding="utf-8")
    rel_problems = []
    for edge in story["graph"]["edges"]:
        for name in edge["rel"].split(" · "):
            if f"[:{name}]" not in model:
                rel_problems.append(f"{name} is not a relationship in docs/graph-model.md")
    r.check("scene relationship names exist in docs/graph-model.md", sorted(set(rel_problems)),
            f"{len(story['graph']['nodes'])} nodes, {len(story['graph']['edges'])} edges")

    print()
    print(f"{len(r.passes)} passed, {len(r.failures)} failed")
    return 1 if r.failures else 0


if __name__ == "__main__":
    sys.exit(main())

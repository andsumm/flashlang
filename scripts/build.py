#!/usr/bin/env python3
"""Package only public app files for GitHub Pages. No build dependencies."""

from pathlib import Path
import hashlib
import shutil


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "_site"
ROOT_FILES = (
    "index.html", "config.js", "styles.css", "design.css", "themes.css", "style.css", "app.js",
    "favicon.svg", "favicon.ico", "manifest.webmanifest", "sw.js", "robots.txt",
)
DIRECTORIES = ("src", "assets", "public", "samples")


def build():
    for required in ("index.html", "config.js", "src"):
        if not (ROOT / required).exists():
            raise SystemExit(f"Missing required app path: {required}")
    OUTPUT.mkdir(exist_ok=True)
    # Clear only this script's generated directory, never the source tree.
    for child in OUTPUT.iterdir():
        if child.is_dir() and not child.is_symlink():
            shutil.rmtree(child)
        else:
            child.unlink()
    for filename in ROOT_FILES:
        source = ROOT / filename
        if source.is_file() and not source.is_symlink():
            shutil.copy2(source, OUTPUT / filename)
    for directory in DIRECTORIES:
        source = ROOT / directory
        if source.is_dir() and not source.is_symlink():
            for path in source.rglob("*"):
                if path.is_symlink():
                    raise SystemExit(f"Symlinks cannot be published: {path.relative_to(ROOT)}")
            shutil.copytree(source, OUTPUT / directory, ignore=shutil.ignore_patterns(".*", "__pycache__"))
    (OUTPUT / ".nojekyll").write_text("", encoding="utf-8")
    # Any public file change gives the worker a new cache name and script body.
    # This avoids a stale offline shell after deploying a new application version.
    digest = hashlib.sha256()
    for path in sorted(OUTPUT.rglob("*")):
        if path.is_file():
            digest.update(str(path.relative_to(OUTPUT)).encode("utf-8"))
            digest.update(path.read_bytes())
    build_version = digest.hexdigest()[:20]
    worker = OUTPUT / "sw.js"
    if worker.exists():
        worker.write_text(worker.read_text(encoding="utf-8").replace("__BUILD_VERSION__", build_version), encoding="utf-8")
    count = sum(1 for path in OUTPUT.rglob("*") if path.is_file())
    print(f"Packaged {count} public files into {OUTPUT} (version {build_version})")


if __name__ == "__main__":
    build()

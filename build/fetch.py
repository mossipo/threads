#!/usr/bin/env python3
"""Download every dataset in sources.json at its pinned commit.

Each source goes into its own directory under the cache folder (default ../.cache/src).
Only the listed paths are checked out (sparse checkout), so the download stays small.

Usage: python3 build/fetch.py [cache_dir] [source_id ...]
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def run(args, cwd=None):
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{' '.join(args)}\n{r.stderr.strip()}")
    return r.stdout.strip()


def fetch(src, cache):
    dest = os.path.join(cache, src["id"])
    url = f"https://github.com/{src['repo']}"
    if not os.path.isdir(os.path.join(dest, ".git")):
        os.makedirs(dest, exist_ok=True)
        run(["git", "init", "-q"], cwd=dest)
        run(["git", "remote", "add", "origin", url], cwd=dest)
    commit = src["commit"]
    ref = commit if commit != "HEAD" else "HEAD"
    run(["git", "fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", ref], cwd=dest)
    paths = src.get("paths") or []
    if paths:
        run(["git", "sparse-checkout", "init", "--no-cone"], cwd=dest)
        run(["git", "sparse-checkout", "set", "--no-cone"] + paths, cwd=dest)
    run(["git", "checkout", "-q", "FETCH_HEAD"], cwd=dest)
    got = run(["git", "rev-parse", "HEAD"], cwd=dest)
    if commit != "HEAD" and got != commit:
        raise RuntimeError(f"{src['id']}: expected {commit}, got {got}")
    return got


def main():
    cache = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", ".cache", "src")
    only = set(sys.argv[2:])
    with open(os.path.join(HERE, "sources.json"), encoding="utf-8") as f:
        sources = json.load(f)["sources"]
    for src in sources:
        if only and src["id"] not in only:
            continue
        if src.get("paths") == [] and src["id"] == "macula_greek":
            print(f"skip  {src['id']:16} (reviewed, not bundled)")
            continue
        try:
            got = fetch(src, cache)
            print(f"ok    {src['id']:16} {got}")
        except Exception as e:  # report and continue with the rest
            print(f"FAIL  {src['id']:16} {e}")


if __name__ == "__main__":
    main()

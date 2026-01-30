#!/usr/bin/env python3
"""
Generate roadmap artifacts from blackbox_roadmap_with_backlog.json:
- docs/ROADMAP.md (grouped by phase)
- docs/ROADMAP_KANBAN.md (kanban-style columns)
- docs/roadmap.csv (flat CSV for triage)
- tools/github/issues_import.csv (CSV compatible with GitHub issues import)

Usage:
  python3 scripts/roadmap/generate.py
"""
import csv
import json
import os
from pathlib import Path


def find_repo_root(start: Path) -> Path:
    cur = start.resolve()
    while cur != cur.parent:
        if (cur / "blackbox_roadmap_with_backlog.json").exists():
            return cur
        cur = cur.parent
    return start.resolve()


def load_tasks(repo_root: Path):
    src = repo_root / "blackbox_roadmap_with_backlog.json"
    with src.open("r", encoding="utf-8") as f:
        data = json.load(f)
    tasks = data.get("tasks", data)
    norm = []
    for t in tasks:
        if not isinstance(t, dict):
            continue
        title = (t.get("title") or "").strip()
        desc = (t.get("description") or t.get("desc") or t.get("desciptio") or "").strip()
        phase = (t.get("phase") or "Unassigned").strip()
        status = (t.get("status") or "To Do").strip()
        if not title:
            continue
        norm.append({"title": title, "description": desc, "phase": phase, "status": status})
    return norm


def ensure_dirs(repo_root: Path):
    (repo_root / "docs").mkdir(exist_ok=True)
    (repo_root / "tools" / "github").mkdir(parents=True, exist_ok=True)


def write_markdown(repo_root: Path, tasks):
    by_phase = {"Now": [], "Next": [], "Later": [], "Unassigned": []}
    for t in tasks:
        by_phase.setdefault(t["phase"], []).append(t)
    for v in by_phase.values():
        v.sort(key=lambda x: (x["status"], x["title"].lower()))

    md = [
        "# Roadmap",
        "",
        "Source: `blackbox_roadmap_with_backlog.json`. Phases reflect delivery priority. Update with `python3 scripts/roadmap/generate.py`.",
        "",
    ]
    for phase in ("Now", "Next", "Later"):
        if not by_phase.get(phase):
            continue
        md.append(f"## {phase}")
        for t in by_phase[phase]:
            line = f"- {t['title']} — {t['status']}"
            if t["description"]:
                short = t["description"].replace("\n", " ").strip()
                if len(short) > 160:
                    short = short[:157] + "..."
                line += f"\n  - {short}"
            md.append(line)
        md.append("")
    (repo_root / "docs" / "ROADMAP.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    # Kanban view
    kanban = [
        "# Roadmap Kanban",
        "",
        "Visual grouping by phase. Use alongside `docs/ROADMAP.md`.",
        "",
    ]
    for phase in ("Now", "Next", "Later"):
        if not by_phase.get(phase):
            continue
        kanban.append(f"## {phase}")
        for t in by_phase[phase]:
            kanban.append(f"- [{t['status']}] {t['title']}")
        kanban.append("")
    (repo_root / "docs" / "ROADMAP_KANBAN.md").write_text("\n".join(kanban) + "\n", encoding="utf-8")


def write_csv(repo_root: Path, tasks):
    with (repo_root / "docs" / "roadmap.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["title", "description", "phase", "status"])
        for t in tasks:
            w.writerow([t["title"], t["description"], t["phase"], t["status"]])

    with (repo_root / "tools" / "github" / "issues_import.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Title", "Body", "Labels"])  # GitHub CSV import headers
        for t in tasks:
            labels = [f"phase:{t['phase']}", f"status:{t['status']}"]
            body = t["description"] or "Imported from roadmap."
            w.writerow([t["title"], body, ",".join(labels)])


def main():
    repo_root = find_repo_root(Path(__file__).parent)
    ensure_dirs(repo_root)
    tasks = load_tasks(repo_root)
    write_markdown(repo_root, tasks)
    write_csv(repo_root, tasks)
    print(f"Generated roadmap assets for {len(tasks)} tasks under docs/ and tools/github/.")


if __name__ == "__main__":
    main()

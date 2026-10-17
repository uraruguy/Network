#!/usr/bin/env python3
"""Cleans an Apple Notes export for import.

  python3 scripts/apple-notes/clean.py [src] [dst]
  (defaults: .cache/notes-export.json → .cache/notes-export.clean.json)

- Strips inline base64 attachments (647 MB → ~3 MB).
- Collapses duplicate note ids (the same note listed under two folders) into one row with `folders[]`.
- Normalises folder names to NFC so "Blaž" and "Blaž" compare equal.
"""
import json, os, re, sys, unicodedata

src = sys.argv[1] if len(sys.argv) > 1 else ".cache/notes-export.json"
dst = sys.argv[2] if len(sys.argv) > 2 else ".cache/notes-export.clean.json"
rows = json.load(open(src))
imgs = 0


def clean(h):
    global imgs
    if not h:
        return h

    def rep(_):
        global imgs
        imgs += 1
        return "<div>[image]</div>"

    h = re.sub(r'<img[^>]*src="data:[^"]*"[^>]*>', rep, h)
    h = re.sub(r"<(object|video|audio)[^>]*>.*?</\1>", "<div>[attachment]</div>", h, flags=re.S)
    return re.sub(r'src="data:[^"]{200,}"', 'src=""', h)


out, by_id, dupes = [], {}, 0
for r in rows:
    r["html"] = clean(r["html"])
    folder = unicodedata.normalize("NFC", r.get("folder") or "")
    r["folder"] = folder
    prev = by_id.get(r["id"])
    if prev is not None:
        dupes += 1
        if folder and folder not in prev["folders"]:
            prev["folders"].append(folder)
        continue
    r["folders"] = [folder] if folder else []
    by_id[r["id"]] = r
    out.append(r)

json.dump(out, open(dst, "w"), ensure_ascii=False)
locked = sum(1 for r in out if r.get("locked"))
print(f"{len(out)} unique notes ({dupes} duplicate rows collapsed, {locked} locked), {imgs} embedded images stripped → {dst} ({os.path.getsize(dst)//1024} KB)")

#!/usr/bin/env python3
"""Strips inline base64 attachments out of .cache/notes-export.json → notes-export.clean.json (647 MB → ~3 MB)."""
import json, os, re
src, dst = ".cache/notes-export.json", ".cache/notes-export.clean.json"
rows = json.load(open(src))
imgs = 0
def clean(h):
    global imgs
    if not h: return h
    def rep(_):
        global imgs; imgs += 1
        return "<div>[image]</div>"
    h = re.sub(r'<img[^>]*src="data:[^"]*"[^>]*>', rep, h)
    h = re.sub(r"<(object|video|audio)[^>]*>.*?</\1>", "<div>[attachment]</div>", h, flags=re.S)
    return re.sub(r'src="data:[^"]{200,}"', 'src=""', h)
for r in rows: r["html"] = clean(r["html"])
json.dump(rows, open(dst, "w"), ensure_ascii=False)
print(f"{len(rows)} notes, {imgs} embedded images stripped → {dst} ({os.path.getsize(dst)//1024} KB)")

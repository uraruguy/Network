#!/usr/bin/env osascript -l JavaScript
// JXA: exports Apple Notes to JSON. Batched property reads (one Apple Event per property
// per folder) — hundreds of notes in seconds instead of minutes.
// Usage (via pnpm notes:export): osascript -l JavaScript export.js [folderName]
ObjC.import("Foundation");

function run(argv) {
  const onlyFolder = argv[0] || null;
  const Notes = Application("Notes");
  const out = [];

  for (const acct of Notes.accounts()) {
    const accountName = acct.name();
    for (const folder of acct.folders()) {
      const folderName = folder.name();
      if (onlyFolder && folderName !== onlyFolder) continue;
      if (folderName === "Recently Deleted") continue;
      const notes = folder.notes;
      let ids;
      try {
        ids = notes.id();
      } catch (e) {
        continue;
      }
      if (!ids.length) continue;
      const names = notes.name();
      const locked = notes.passwordProtected();
      const created = notes.creationDate();
      const modified = notes.modificationDate();
      let bodies = [], plains = [];
      try {
        bodies = notes.body();
        plains = notes.plaintext();
      } catch (e) {
        // Fall back to per-note reads if a batch fails (e.g. one enormous note)
        for (let i = 0; i < ids.length; i++) {
          try { bodies[i] = notes[i].body(); } catch (_) { bodies[i] = null; }
          try { plains[i] = notes[i].plaintext(); } catch (_) { plains[i] = null; }
        }
      }
      for (let i = 0; i < ids.length; i++) {
        out.push({
          id: ids[i],
          title: names[i],
          html: locked[i] ? null : bodies[i],
          text: locked[i] ? null : plains[i],
          created: created[i] ? created[i].toISOString() : null,
          modified: modified[i] ? modified[i].toISOString() : null,
          folder: folderName,
          account: accountName,
          locked: !!locked[i],
        });
      }
    }
  }
  return JSON.stringify(out);
}

// JXA: exports Apple Notes to a JSON file. Batched property reads (one Apple Event per
// property per folder) — hundreds of notes in seconds. Writes the file itself because
// osascript drops very large return values.
// Usage: osascript -l JavaScript scripts/apple-notes/export.js <outFile> [folderName]
ObjC.import("Foundation");

function log(msg) {
  $.NSFileHandle.fileHandleWithStandardError.writeData($.NSString.alloc.initWithUTF8String(msg + "\n").dataUsingEncoding($.NSUTF8StringEncoding));
}

function run(argv) {
  const outFile = argv[0];
  if (!outFile) throw new Error("Usage: export.js <outFile> [folderName]");
  const onlyFolder = argv[1] || null;
  const Notes = Application("Notes");
  const out = [];
  const errors = [];

  for (const acct of Notes.accounts()) {
    const accountName = acct.name();
    for (const folder of acct.folders()) {
      const folderName = folder.name();
      if (onlyFolder && folderName !== onlyFolder) continue;
      if (folderName === "Recently Deleted") continue;
      const notes = folder.notes;
      let count = 0;
      try {
        count = notes.length;
      } catch (e) {
        continue;
      }
      if (!count) continue;
      try {
        const ids = notes.id();
        const names = notes.name();
        const created = notes.creationDate();
        const modified = notes.modificationDate();
        let locked;
        try { locked = notes.passwordProtected(); } catch (e) { locked = ids.map(() => false); }
        let bodies = [], plains = [];
        try {
          bodies = notes.body();
          plains = notes.plaintext();
        } catch (e) {
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
        log(`  ${String(ids.length).padStart(4)}  ${accountName} / ${folderName}`);
      } catch (e) {
        errors.push(`${accountName}/${folderName}: ${e.message}`);
        log(`  FAIL  ${accountName} / ${folderName}: ${e.message}`);
      }
    }
  }

  const json = $.NSString.alloc.initWithUTF8String(JSON.stringify(out));
  const ok = json.writeToFileAtomicallyEncodingError(outFile, true, $.NSUTF8StringEncoding, null);
  if (!ok) throw new Error("Could not write " + outFile);
  return JSON.stringify({ notes: out.length, locked: out.filter((n) => n.locked).length, errors, file: outFile });
}

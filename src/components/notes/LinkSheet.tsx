"use client";
import type { Editor } from "@tiptap/react";
import { useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { Field } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { linkAt } from "@/lib/notes/extensions";

/** Adds `https://` to bare domains ("example.com"); keeps mailto:/tel:/http(s). */
export function normalizeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null; // other schemes (javascript:, data:…) are not links here
  return `https://${v}`;
}

type Range = { from: number; to: number };

/**
 * ⌘K / "Link" — add, edit or remove the link on the selection. With no selection, also asks for
 * the text to show. Sheet on phones, dialog on desktop.
 */
export function LinkSheet({ editor, open, onOpenChange }: { editor: Editor; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [range, setRange] = useState<Range | null>(null);
  const [existing, setExisting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Capture the selection when opening (focus moves into the sheet afterwards).
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    const current = linkAt(editor);
    const { from, to, empty } = editor.state.selection;
    setExisting(!!current);
    setUrl(current ?? "");
    setText(empty && !current ? "" : editor.state.doc.textBetween(from, to, " "));
    setRange({ from, to });
    setError(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const needsText = !!range && range.from === range.to && !existing;

  const apply = () => {
    const href = normalizeUrl(url);
    if (!href) {
      setError("Enter a web address, e.g. example.com");
      return false;
    }
    const chain = editor.chain().focus();
    if (range) chain.setTextSelection(range);
    if (needsText) {
      const label = text.trim() || href.replace(/^(https?:\/\/|mailto:)/, "");
      chain.insertContent({ type: "text", text: label, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain.extendMarkRange("link").setLink({ href }).run();
    }
    return true;
  };

  const remove = () => {
    const chain = editor.chain().focus();
    if (range) chain.setTextSelection(range);
    chain.extendMarkRange("link").unsetLink().run();
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) requestAnimationFrame(() => editor.commands.focus());
      }}
      title={existing ? "Edit Link" : "Add Link"}
      cancel
      done={existing ? "Save" : "Add"}
      onDone={apply}
      doneDisabled={!url.trim()}
      width={420}
    >
      <form
        noValidate
        className="space-y-4 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (apply()) onOpenChange(false);
        }}
      >
        <Field label="Address" error={error}>
          <GlassInput
            autoFocus
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="example.com"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            enterKeyHint="done"
          />
        </Field>
        {needsText && (
          <Field label="Text" hint="Leave empty to show the address">
            <GlassInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Link text" enterKeyHint="done" />
          </Field>
        )}
        <button type="submit" hidden />
        {existing && (
          <GlassButton variant="danger" className="w-full" onClick={remove}>
            Remove Link
          </GlassButton>
        )}
      </form>
    </Sheet>
  );
}

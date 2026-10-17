"use client";
import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toast";

/**
 * Shows freshly generated recovery codes exactly once: copy / download, then an explicit
 * "I saved them" before continuing. The codes only ever live in this component's props — never
 * in the query cache (which is persisted to disk) or in storage.
 */
export function RecoveryCodes({ codes, onDone, doneLabel = "Continue" }: { codes: string[]; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `The Network — recovery codes\nEach code works once, if you can't use your passkey.\n\n${codes.join("\n")}\n`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy", { description: "Select the codes and copy them manually." });
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "the-network-recovery-codes.txt" });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-4">
      <ol aria-label="Recovery codes" className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-md bg-fill-1 p-4 font-mono text-subhead tracking-wide text-fg tabular-nums select-all">
        {codes.map((c) => (
          <li key={c} className="text-center">
            {c}
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-2 gap-2">
        <GlassButton variant="surface" onClick={copy}>
          {copied ? <Check size={17} strokeWidth={2.6} /> : <Copy size={17} />}
          {copied ? "Copied" : "Copy"}
        </GlassButton>
        <GlassButton variant="surface" onClick={download}>
          <Download size={17} />
          Download
        </GlassButton>
      </div>
      <p className="px-1 text-footnote text-fg-3">
        Keep them somewhere safe and separate from your devices — a password manager note or on paper. You won&apos;t see them again.
      </p>
      <Switch label="I saved my recovery codes" checked={saved} onCheckedChange={setSaved} className="px-1" />
      <GlassButton variant="primary" size="lg" className="w-full" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </GlassButton>
    </div>
  );
}

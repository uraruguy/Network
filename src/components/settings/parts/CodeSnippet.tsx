"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/utils";

/** A one-line command with a copy button. */
export function CodeSnippet({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure context): the text is selectable anyway.
    }
  };
  return (
    <div className={cn("flex min-w-0 items-center gap-1 rounded-xs bg-fill-1 py-1 pr-1 pl-3 ring-[0.5px] ring-hairline", className)}>
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-footnote whitespace-nowrap text-fg-2 select-all no-scrollbar">{code}</code>
      <IconButton size="sm" variant="plain" label={copied ? "Copied" : "Copy command"} icon={copied ? <Check className="text-success" /> : <Copy />} onClick={copy} />
    </div>
  );
}

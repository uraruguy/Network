"use client";
import { Eye, EyeOff, KeyRound, Lock, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GlassButton } from "@/components/glass/GlassButton";
import { inputClass } from "@/components/glass/GlassInput";
import { IconButton } from "@/components/ui/IconButton";
import { fieldTrigger } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

/**
 * Write-only secret input (API keys, passwords). The stored value never comes back from the
 * server — only a hint like "sk-…a1b2".
 *
 *   value === undefined → keep the stored secret (shows the hint with Replace / Clear)
 *   value === null      → clear it on save
 *   value is a string   → replace it on save ("" while typing = keep)
 */
export type SecretDraft = string | null | undefined;

export type SecretFieldProps = {
  id?: string;
  value: SecretDraft;
  onChange: (value: SecretDraft) => void;
  /** A secret is stored (or set in the environment). */
  hasSecret: boolean;
  hint: string | null;
  placeholder?: string;
  /** Environment-managed: show the hint, no editing. */
  readOnly?: boolean;
  invalid?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  /** Accessible name for the input (the visible label comes from <Field>). */
  label: string;
};

/** What to send for a draft: omit (keep), "" (clear) or the new value. */
export function secretPayload(value: SecretDraft): string | undefined {
  if (value === null) return "";
  const v = value?.trim();
  return v ? v : undefined;
}

export function SecretField({ id, value, onChange, hasSecret, hint, placeholder = "Paste your key", readOnly, invalid, label, ...aria }: SecretFieldProps) {
  const [reveal, setReveal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = typeof value === "string" || !hasSecret;
  const wasEditing = useRef(editing);

  useEffect(() => {
    // Focus the input right after "Replace".
    if (editing && !wasEditing.current) inputRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  if (readOnly || (!editing && value !== null)) {
    return (
      <div id={id} className={cn(fieldTrigger, "gap-2.5 pr-1.5")} aria-label={label} role="group" {...aria}>
        {readOnly ? <Lock size={16} className="shrink-0 text-fg-3" aria-hidden /> : <KeyRound size={16} className="shrink-0 text-fg-3" aria-hidden />}
        <span className="min-w-0 flex-1 truncate font-mono text-subhead tracking-wide text-fg-2">{hint ?? "••••••••"}</span>
        {!readOnly && (
          <span className="flex shrink-0 items-center gap-1">
            <GlassButton size="sm" variant="plain" onClick={() => onChange("")}>
              Replace
            </GlassButton>
            <GlassButton size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => onChange(null)}>
              Clear
            </GlassButton>
          </span>
        )}
      </div>
    );
  }

  if (value === null) {
    return (
      <div id={id} className={cn(fieldTrigger, "gap-2.5 border-dashed pr-1.5 shadow-none")} role="group" aria-label={label} {...aria}>
        <KeyRound size={16} className="shrink-0 text-danger" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-subhead text-fg-2">Removed when you save</span>
        <GlassButton size="sm" variant="plain" onClick={() => onChange(undefined)}>
          <Undo2 size={14} /> Undo
        </GlassButton>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type={reveal ? "text" : "password"}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && hasSecret) {
            e.preventDefault();
            onChange(undefined);
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={invalid || aria["aria-invalid"] || undefined}
        aria-describedby={aria["aria-describedby"]}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        className={cn(inputClass, "h-11 font-mono text-subhead", hasSecret ? "pr-32" : "pr-11")}
      />
      <span className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
        {hasSecret && (
          <GlassButton size="sm" variant="ghost" onClick={() => onChange(undefined)}>
            Cancel
          </GlassButton>
        )}
        <IconButton size="sm" variant="plain" label={reveal ? "Hide key" : "Show key"} icon={reveal ? <EyeOff /> : <Eye />} onClick={() => setReveal((r) => !r)} />
      </span>
    </div>
  );
}

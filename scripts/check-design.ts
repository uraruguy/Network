/**
 * Design-token lint: finds values that bypass the design system in component code.
 *
 *   pnpm lint:design            # report (exit 0)
 *   pnpm lint:design --strict   # exit 1 when anything is found (CI)
 *   pnpm lint:design --json     # machine-readable
 *   pnpm lint:design src/app    # scan other roots (default: src/components)
 *
 * Flags:  text-[13px]  → use the type scale (text-footnote …)
 *         rounded-[14px] → use radius tokens (rounded-xs … rounded-xl)
 *         #0fb5ba      → use colour tokens (bg-accent, var(--warm-inner), palette …)
 * Add `design-ignore` in a comment on the line to allow a deliberate exception.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

type Kind = "font-size" | "radius" | "hex";
type Finding = { file: string; line: number; col: number; kind: Kind; match: string; hint: string };

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const json = args.includes("--json");
const roots = args.filter((a) => !a.startsWith("--"));
const ROOTS = roots.length ? roots : ["src/components"];
const EXT = /\.(tsx?|css)$/;
const SKIP = /\.(test|spec)\.tsx?$|\/node_modules\//;

const TYPE_SCALE: [number, string][] = [
  [11, "text-caption2"],
  [12, "text-caption"],
  [13, "text-footnote"],
  [15, "text-subhead"],
  [16, "text-callout"],
  [17, "text-body / text-headline"],
  [20, "text-title3"],
  [22, "text-title2"],
  [28, "text-title1"],
  [34, "text-large-title"],
];
const RADII: [number, string][] = [
  [8, "rounded-xs"],
  [12, "rounded-sm"],
  [16, "rounded-md"],
  [22, "rounded-lg"],
  [28, "rounded-xl"],
];

const nearest = (px: number, scale: [number, string][]) =>
  scale.reduce((best, cur) => (Math.abs(cur[0] - px) < Math.abs(best[0] - px) ? cur : best))[1];

const RULES: { kind: Kind; re: RegExp; hint: (m: RegExpExecArray) => string }[] = [
  {
    kind: "font-size",
    re: /\btext-\[(\d+(?:\.\d+)?)px\]/g,
    hint: (m) => `use ${nearest(Number(m[1]), TYPE_SCALE)}`,
  },
  {
    kind: "radius",
    re: /\brounded(?:-[trblse]{1,2})?-\[(\d+(?:\.\d+)?)px\]/g,
    hint: (m) => `use ${nearest(Number(m[1]), RADII)} (or rounded-full)`,
  },
  {
    kind: "hex",
    re: /(?<![&\w/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
    hint: () => "use a colour token (bg-accent, text-fg-2, var(--warm-inner), paletteVar(), useResolvedTokens for canvas)",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.test(name) && !SKIP.test(p)) out.push(p);
  }
  return out;
}

const findings: Finding[] = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      if (text.includes("design-ignore")) return;
      for (const rule of RULES) {
        if (rule.kind === "hex" && file.endsWith(".css") && /^\s*(--[\w-]+|@)/.test(text)) continue; // token definitions
        rule.re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = rule.re.exec(text))) {
          findings.push({ file: relative(process.cwd(), file), line: i + 1, col: m.index + 1, kind: rule.kind, match: m[0], hint: rule.hint(m) });
        }
      }
    });
  }
}

if (json) {
  console.log(JSON.stringify({ count: findings.length, findings }, null, 2));
} else if (findings.length === 0) {
  console.log(`✓ design tokens: no raw font sizes, radii or hex colours in ${ROOTS.join(", ")}`);
} else {
  const byFile = new Map<string, Finding[]>();
  for (const f of findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);
  for (const [file, list] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${file}  (${list.length})`);
    for (const f of list) console.log(`  ${String(f.line).padStart(4)}:${String(f.col).padEnd(3)} ${f.kind.padEnd(9)} ${f.match.padEnd(16)} ${f.hint}`);
  }
  const counts = findings.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }), {});
  const top = Object.entries(
    findings.filter((f) => f.kind === "font-size").reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.match]: (acc[f.match] ?? 0) + 1 }), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k}×${v}`)
    .join("  ");
  console.log(
    `\n${findings.length} finding(s) in ${byFile.size} file(s): ${Object.entries(counts)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}${top ? `\nmost common sizes: ${top}` : ""}`,
  );
  if (!strict) console.log("(report only — run with --strict to fail)");
}

process.exit(strict && findings.length > 0 ? 1 : 0);

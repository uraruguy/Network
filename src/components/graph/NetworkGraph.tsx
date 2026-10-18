"use client";
/**
 * Force-directed "who introduced whom" graph on canvas. Canvas can't read CSS variables, so every
 * colour is a design token resolved to hex by `useResolvedTokens` (re-resolved on theme change);
 * avatar fallbacks use the muted category palette.
 */
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-2d";
import { useEffect, useMemo, useRef } from "react";
import type { GraphLink, GraphNode } from "@/lib/queries/types";
import { useResolvedTokens } from "@/lib/design/useResolvedTokens";
import { oklchToHex } from "@/lib/design/color";
import { paletteFor } from "@/lib/constants/palette";
import { initials } from "@/lib/utils";

type N = NodeObject<GraphNode & { me?: boolean }>;
type L = LinkObject<GraphNode & { me?: boolean }, GraphLink>;

type Props = {
  nodes: GraphNode[];
  links: GraphLink[];
  meName: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  width: number;
  height: number;
  /** Space taken by overlays (header on top, tab bar / panel elsewhere) for zoom-to-fit. */
  insets: { top: number; right: number; bottom: number; left: number };
};

const TOKENS = [
  "--fg",
  "--fg-3",
  "--fg-4",
  "--accent",
  "--accent-fill",
  "--accent-fg",
  "--warm-inner",
  "--warm-active",
  "--warm-dormant",
  "--warm-archive",
  "--surface-solid",
] as const;

const FONT = "-apple-system, BlinkMacSystemFont, system-ui, sans-serif";
const endId = (v: unknown) => (v && typeof v === "object" ? String((v as { id: string }).id) : String(v));
/** `#rrggbb` + alpha byte. */
const withAlpha = (hex: string, a: number) => `${hex.slice(0, 7)}${Math.round(Math.min(1, Math.max(0, a)) * 255).toString(16).padStart(2, "0")}`;

export function NetworkGraph({ nodes, links, meName, selectedId, onSelect, width, height, insets }: Props) {
  const ref = useRef<ForceGraphMethods<N, L> | undefined>(undefined);
  const imgCache = useRef(new Map<string, HTMLImageElement>());
  const fitted = useRef(false);
  const t = useResolvedTokens(TOKENS);
  const dark = t.theme === "dark";

  const warmth: Record<string, string> = {
    inner: t["--warm-inner"],
    active: t["--warm-active"],
    dormant: t["--warm-dormant"],
    archive: t["--warm-archive"],
  };

  const data = useMemo(
    () => ({
      nodes: [
        { id: "me", name: meName, me: true, avatarUrl: null, warmth: "inner", circle: null, categoryIds: [], notes: 0, location: null, countryCode: null } as N,
        ...nodes.map((n) => ({ ...n }) as N),
      ],
      links: links.map((l) => ({ ...l }) as L),
    }),
    [nodes, links, meName],
  );

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) {
      if (!m.has(l.source)) m.set(l.source, new Set());
      if (!m.has(l.target)) m.set(l.target, new Set());
      m.get(l.source)!.add(l.target);
      m.get(l.target)!.add(l.source);
    }
    return m;
  }, [links]);

  /** Names appear once nodes are big enough to read them; a crowded graph waits for more zoom. */
  const labelScale = nodes.length > 400 ? 2.2 : nodes.length > 120 ? 1.3 : 0.55;
  const fitPadding = Math.max(insets.top, insets.bottom, insets.left, insets.right, Math.min(width, height) * 0.08);

  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.d3Force("charge")?.strength(-140);
    g.d3Force("link")?.distance((l: L) => (l.kind === "met" ? 80 : l.kind === "introduced" ? 55 : 65));
    fitted.current = false;
    const early = setTimeout(() => !fitted.current && g.zoomToFit(400, fitPadding), 1200);
    return () => clearTimeout(early);
    // Re-run only when the graph itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    const g = ref.current;
    if (!g || !selectedId) return;
    const n = data.nodes.find((x) => x.id === selectedId);
    if (n && typeof n.x === "number" && typeof n.y === "number") {
      g.centerAt(n.x, n.y, 500);
      g.zoom(Math.max(g.zoom(), 2.2), 500);
    }
  }, [selectedId, data.nodes]);

  const avatarFill = (name: string) => {
    const p = paletteFor(name);
    const tone = dark ? p.dark : p.light;
    return oklchToHex(tone.l, tone.c, p.hue);
  };

  const drawNode = (node: N, ctx: CanvasRenderingContext2D, scale: number) => {
    const x = node.x ?? 0, y = node.y ?? 0;
    const isMe = !!node.me;
    const r = isMe ? 12 : 6 + Math.min(6, Math.sqrt(node.notes ?? 0) * 1.6);
    const dim = !!selectedId && node.id !== selectedId && !neighbors.get(selectedId)?.has(String(node.id));
    ctx.globalAlpha = dim ? 0.22 : 1;

    if (node.id === selectedId || isMe) {
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, 2 * Math.PI);
      ctx.fillStyle = withAlpha(t["--accent"], isMe ? 0.22 : 0.3);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    if (isMe) {
      ctx.fillStyle = t["--accent-fill"];
      ctx.fill();
    } else if (node.avatarUrl) {
      let img = imgCache.current.get(node.avatarUrl);
      if (!img) {
        img = new Image();
        img.src = node.avatarUrl;
        imgCache.current.set(node.avatarUrl, img);
      }
      ctx.save();
      ctx.clip();
      ctx.fillStyle = avatarFill(node.name);
      ctx.fill();
      if (img.complete && img.naturalWidth) ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = avatarFill(node.name);
      ctx.fill();
    }
    ctx.lineWidth = isMe ? 2 : 1.6;
    ctx.strokeStyle = isMe ? t["--surface-solid"] : (warmth[node.warmth] ?? t["--accent"]);
    ctx.stroke();

    if (!node.avatarUrl || isMe) {
      ctx.fillStyle = isMe ? t["--accent-fg"] : t["--surface-solid"];
      ctx.font = `600 ${Math.max(5, r * 0.82)}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(isMe ? initials(meName) || "Me" : initials(node.name), x, y + 0.5);
    }
    if (scale > labelScale || isMe || node.id === selectedId || (selectedId && !dim)) {
      ctx.fillStyle = t["--fg"];
      ctx.font = `${isMe ? 600 : 500} ${Math.max(3.5, 11 / Math.max(1, scale * 0.9))}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(isMe ? "You" : node.name, x, y + r + 3);
    }
    ctx.globalAlpha = 1;
  };

  const linkColour = (l: L) => {
    const s = endId(l.source);
    const tgt = endId(l.target);
    const on = !selectedId || s === selectedId || tgt === selectedId;
    if (l.kind === "introduced") return withAlpha(t["--accent"], on ? 0.8 : 0.08);
    if (l.kind === "mention") return withAlpha(t["--warm-inner"], on ? 0.7 : 0.06);
    return withAlpha(t["--fg-4"], on ? 0.4 : 0.06);
  };

  return (
    <ForceGraph2D
      ref={ref}
      width={width}
      height={height}
      graphData={data}
      backgroundColor="rgba(0,0,0,0)"
      nodeRelSize={6}
      nodeVal={(n) => ((n as N).me ? 4 : 1)}
      nodeLabel={() => ""}
      nodeCanvasObject={(n, ctx, s) => drawNode(n as N, ctx, s)}
      nodePointerAreaPaint={(n, color, ctx) => {
        const node = n as N;
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, node.me ? 14 : 12, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      }}
      linkColor={(l) => linkColour(l as L)}
      linkWidth={(l) => ((l as L).kind === "introduced" ? 1.8 : (l as L).kind === "mention" ? 1 + Math.min(2, (l as L).weight * 0.4) : 0.8)}
      linkLineDash={(l) => ((l as L).kind === "mention" ? [2, 2] : null)}
      linkDirectionalArrowLength={(l) => ((l as L).kind === "introduced" ? 4 : 0)}
      linkDirectionalArrowRelPos={1}
      linkDirectionalParticles={(l) => ((l as L).kind === "introduced" && selectedId ? 2 : 0)}
      linkDirectionalParticleWidth={2}
      linkDirectionalParticleColor={() => t["--accent"]}
      onNodeClick={(n) => onSelect((n as N).me ? null : String((n as N).id))}
      onBackgroundClick={() => onSelect(null)}
      cooldownTicks={110}
      warmupTicks={40}
      d3AlphaDecay={0.045}
      onEngineStop={() => {
        if (fitted.current) return;
        fitted.current = true;
        ref.current?.zoomToFit(500, fitPadding);
      }}
      d3VelocityDecay={0.3}
      minZoom={0.3}
      maxZoom={6}
      enableNodeDrag
    />
  );
}

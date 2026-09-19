"use client";
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from "react-force-graph-2d";
import { useEffect, useMemo, useRef } from "react";
import type { GraphLink, GraphNode } from "@/lib/data/graph";
import { hueFromString, initials, WARMTH_META } from "@/lib/utils";

type N = NodeObject<GraphNode & { me?: boolean }>;
type L = LinkObject<GraphNode & { me?: boolean }, GraphLink>;

type Props = {
  nodes: GraphNode[];
  links: GraphLink[];
  meName: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  dark: boolean;
  width: number;
  height: number;
};

const CSS = (v: string) => (typeof window === "undefined" ? "#0fb5ba" : getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#0fb5ba");

export function NetworkGraph({ nodes, links, meName, selectedId, onSelect, dark, width, height }: Props) {
  const ref = useRef<ForceGraphMethods<N, L> | undefined>(undefined);
  const imgCache = useRef(new Map<string, HTMLImageElement>());
  const fitted = useRef(false);

  const data = useMemo(
    () => ({
      nodes: [{ id: "me", name: meName, me: true, avatarUrl: null, warmth: "inner", circle: null, categoryIds: [], notes: 0, location: null, countryCode: null } as N, ...nodes.map((n) => ({ ...n }) as N)],
      links: links.map((l) => ({ ...l }) as L),
    }),
    [nodes, links, meName],
  );

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) {
      const s = l.source, t = l.target;
      if (!m.has(s)) m.set(s, new Set());
      if (!m.has(t)) m.set(t, new Set());
      m.get(s)!.add(t);
      m.get(t)!.add(s);
    }
    return m;
  }, [links]);

  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.d3Force("charge")?.strength(-140);
    g.d3Force("link")?.distance((l: L) => (l.kind === "met" ? 80 : l.kind === "introduced" ? 55 : 65));
    fitted.current = false;
    const early = setTimeout(() => !fitted.current && g.zoomToFit(400, Math.min(width, height) * 0.14), 1200);
    return () => clearTimeout(early);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    const g = ref.current;
    if (!g || !selectedId) return;
    const n = data.nodes.find((x) => x.id === selectedId);
    if (n && typeof n.x === "number" && typeof n.y === "number") {
      g.centerAt(n.x, n.y, 500);
      g.zoom(2.2, 500);
    }
  }, [selectedId, data.nodes]);

  const fg = dark ? "#e8f6f6" : "#0b2426";
  const accent = CSS("--accent");

  const drawNode = (node: N, ctx: CanvasRenderingContext2D, scale: number) => {
    const x = node.x ?? 0, y = node.y ?? 0;
    const isMe = !!node.me;
    const r = isMe ? 12 : 6 + Math.min(6, Math.sqrt(node.notes ?? 0) * 1.6);
    const dim = selectedId && node.id !== selectedId && !neighbors.get(selectedId)?.has(String(node.id));
    ctx.globalAlpha = dim ? 0.25 : 1;

    if (node.id === selectedId || isMe) {
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, 2 * Math.PI);
      ctx.fillStyle = isMe ? `${accent}33` : "rgba(255,107,107,0.25)";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    if (isMe) {
      ctx.fillStyle = accent;
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
      if (img.complete) ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
      ctx.restore();
    } else {
      const hue = hueFromString(node.name);
      ctx.fillStyle = `hsl(${hue} 65% ${dark ? 48 : 58}%)`;
      ctx.fill();
    }
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = isMe ? "#fff" : WARMTH_META[node.warmth as keyof typeof WARMTH_META]?.color ?? accent;
    ctx.stroke();
    if (!node.avatarUrl && !isMe) {
      ctx.fillStyle = "#fff";
      ctx.font = `600 ${Math.max(5, r * 0.85)}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initials(node.name), x, y + 0.5);
    }
    if (scale > 0.55 || isMe || node.id === selectedId) {
      ctx.fillStyle = fg;
      ctx.font = `${isMe ? 600 : 500} ${Math.max(3.5, 11 / Math.max(1, scale * 0.9))}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(isMe ? "You" : node.name, x, y + r + 3);
    }
    ctx.globalAlpha = 1;
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
      linkColor={(l) => {
        const link = l as L;
        const endId = (v: unknown) => (v && typeof v === "object" ? String((v as { id: string }).id) : String(v));
        const s = endId(link.source);
        const t = endId(link.target);
        const on = !selectedId || s === selectedId || t === selectedId;
        const base = link.kind === "introduced" ? (dark ? "42,212,221" : "10,148,154") : link.kind === "mention" ? "255,107,107" : dark ? "180,205,207" : "122,146,149";
        return `rgba(${base},${on ? (link.kind === "met" ? 0.35 : 0.8) : 0.08})`;
      }}
      linkWidth={(l) => ((l as L).kind === "introduced" ? 1.8 : (l as L).kind === "mention" ? 1 + Math.min(2, (l as L).weight * 0.4) : 0.8)}
      linkLineDash={(l) => ((l as L).kind === "mention" ? [2, 2] : null)}
      linkDirectionalArrowLength={(l) => ((l as L).kind === "introduced" ? 4 : 0)}
      linkDirectionalArrowRelPos={1}
      linkDirectionalParticles={(l) => ((l as L).kind === "introduced" && selectedId ? 2 : 0)}
      linkDirectionalParticleWidth={2}
      onNodeClick={(n) => onSelect((n as N).me ? null : String((n as N).id))}
      onBackgroundClick={() => onSelect(null)}
      cooldownTicks={110}
      warmupTicks={40}
      d3AlphaDecay={0.045}
      onEngineStop={() => {
        if (fitted.current) return;
        fitted.current = true;
        ref.current?.zoomToFit(500, Math.min(width, height) * 0.14);
      }}
      d3VelocityDecay={0.3}
      minZoom={0.4}
      maxZoom={6}
      enableNodeDrag
    />
  );
}

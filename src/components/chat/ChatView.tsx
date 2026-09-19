"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, History, Plus, Sparkles, Square, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import { GlassSheet } from "@/components/glass/GlassSheet";
import { Logo } from "@/components/shell/Logo";
import { usePerson } from "@/lib/queries/people";
import { cn, formatRelative } from "@/lib/utils";

type Thread = { id: string; title: string | null; updatedAt: string; personId: string | null };
type ThreadDetail = Thread & { messages: { id: string; role: string; parts: unknown }[] };

const SUGGESTIONS = [
  "Who do I know in Berlin?",
  "Kdo so moji mentorji in kdaj sem nazadnje govoril z njimi?",
  "Who should I follow up with this week?",
  "Who plays padel or goes hiking?",
  "Kaj sem si zapisal o Ingu?",
];

function newId() {
  return crypto.randomUUID();
}

export function ChatView() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const personId = params.get("person");
  const initialThread = params.get("t");
  const [threadId, setThreadId] = useState<string>(() => initialThread ?? newId());
  const [initial, setInitial] = useState<UIMessage[] | null>(initialThread ? null : []);
  const [history, setHistory] = useState(false);
  const { data: person } = usePerson(personId);
  const { data: threads = [] } = useQuery({ queryKey: ["chat", "threads"], queryFn: () => api.get<Thread[]>("/api/chat/threads") });

  // Load an existing thread's transcript
  useEffect(() => {
    if (!initialThread) return;
    api.get<ThreadDetail>(`/api/chat/threads?id=${initialThread}`).then((t) => setInitial((t.messages ?? []).map((m) => ({ id: m.id, role: m.role as UIMessage["role"], parts: m.parts as UIMessage["parts"] })))).catch(() => setInitial([]));
  }, [initialThread]);

  if (initial === null) return <div className="glass h-64 animate-pulse rounded-[var(--r-lg)]" />;

  return (
    <ChatSession
      key={threadId}
      threadId={threadId}
      initialMessages={initial}
      personId={personId}
      personName={person?.displayName ?? null}
      threads={threads}
      historyOpen={history}
      setHistoryOpen={setHistory}
      onNew={() => {
        const id = newId();
        setThreadId(id);
        setInitial([]);
        router.replace("/chat");
      }}
      onOpen={async (id) => {
        setHistory(false);
        const t = await api.get<ThreadDetail>(`/api/chat/threads?id=${id}`);
        setInitial((t.messages ?? []).map((m) => ({ id: m.id, role: m.role as UIMessage["role"], parts: m.parts as UIMessage["parts"] })));
        setThreadId(id);
        router.replace(`/chat?t=${id}`);
      }}
      onDelete={async (id) => {
        await api.delete(`/api/chat/threads?id=${id}`);
        qc.invalidateQueries({ queryKey: ["chat", "threads"] });
      }}
      onFinished={() => qc.invalidateQueries({ queryKey: ["chat", "threads"] })}
      clearPerson={() => router.replace("/chat")}
    />
  );
}

function ChatSession({ threadId, initialMessages, personId, personName, threads, historyOpen, setHistoryOpen, onNew, onOpen, onDelete, onFinished, clearPerson }: {
  threadId: string; initialMessages: UIMessage[]; personId: string | null; personName: string | null; threads: Thread[];
  historyOpen: boolean; setHistoryOpen: (v: boolean) => void; onNew: () => void; onOpen: (id: string) => void; onDelete: (id: string) => void; onFinished: () => void; clearPerson: () => void;
}) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat", body: { personId } }), [personId]);
  const { messages, sendMessage, status, stop, error } = useChat({ id: threadId, messages: initialMessages, transport, onFinish: onFinished });
  const [input, setInput] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    sendMessage({ text: t });
    setInput("");
  };

  return (
    <div className="flex h-[calc(100dvh-84px-var(--sab)-12px-var(--sat))] flex-col lg:h-[calc(100dvh-64px)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-[28px] font-bold tracking-tight sm:text-[34px]">Chat</h1>
          {personName && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] font-medium text-accent-strong">
              about {personName}
              <button onClick={clearPerson} aria-label="Clear"><X size={12} /></button>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setHistoryOpen(true)} className="pressable glass specular grid h-10 w-10 place-items-center rounded-full text-fg-2" aria-label="History"><History size={17} /></button>
          <button onClick={onNew} className="pressable glass specular grid h-10 w-10 place-items-center rounded-full text-fg-2" aria-label="New chat"><Plus size={18} /></button>
        </div>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent-strong"><Sparkles size={26} /></div>
            <div>
              <p className="text-[18px] font-semibold tracking-tight">Ask your network anything</p>
              <p className="mt-1 text-[14px] text-fg-2">It reads all your people, notes and follow-ups.</p>
            </div>
            <div className="flex max-w-md flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => submit(s)} className="pressable glass specular rounded-full px-3.5 py-2 text-[13.5px] text-fg-2 hover:text-fg">{s}</button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-4">
          {messages.map((m) => <Message key={m.id} m={m} />)}
          {status === "submitted" && (
            <div className="flex items-center gap-2 text-[13px] text-fg-3"><Logo size={20} /> Thinking…</div>
          )}
          {error && <p className="text-[13px] text-danger">{error.message}</p>}
        </div>
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); submit(input); }}
        className="glass-strong specular mt-2 flex items-end gap-2 rounded-[26px] p-1.5 pl-4"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input); } }}
          placeholder={personName ? `Ask about ${personName}…` : "Ask, note, or plan a follow-up…"}
          rows={1}
          className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[16px] outline-none placeholder:text-fg-4"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        {busy ? (
          <button type="button" onClick={stop} className="pressable grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fg/8 text-fg" aria-label="Stop"><Square size={16} /></button>
        ) : (
          <button type="submit" disabled={!input.trim()} className="pressable grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-accent-fg disabled:opacity-40" aria-label="Send"><ArrowUp size={18} strokeWidth={2.6} /></button>
        )}
      </form>

      <GlassSheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Conversations" width={440}>
        {threads.length === 0 ? (
          <p className="pb-4 text-[14px] text-fg-2">No conversations yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--glass-border-2)] pb-2">
            {threads.map((t) => (
              <li key={t.id} className="flex items-center gap-2 py-1">
                <button onClick={() => onOpen(t.id)} className="min-w-0 flex-1 rounded-[12px] px-2 py-2 text-left hover:bg-fg/4">
                  <p className="truncate text-[15px] font-medium">{t.title || "Untitled"}</p>
                  <p className="text-[12px] text-fg-3">{formatRelative(t.updatedAt)}</p>
                </button>
                <button onClick={() => onDelete(t.id)} aria-label="Delete" className="pressable grid h-8 w-8 place-items-center rounded-full text-fg-4 hover:bg-danger/10 hover:text-danger"><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </GlassSheet>
    </div>
  );
}

function Message({ m }: { m: UIMessage }) {
  const isUser = m.role === "user";
  return (
    <div className={cn("flex gap-2.5", isUser ? "justify-end" : "justify-start")}>
      {!isUser && <div className="mt-1 shrink-0"><Logo size={26} /></div>}
      <div className={cn("max-w-[86%] space-y-2", isUser && "max-w-[80%]")}>
        {m.parts.map((part, i) => {
          if (part.type === "text") {
            if (!part.text.trim()) return null;
            return isUser ? (
              <div key={i} className="rounded-[20px] rounded-br-[8px] bg-accent px-4 py-2.5 text-[15.5px] text-accent-fg whitespace-pre-wrap">{part.text}</div>
            ) : (
              <div key={i} className="prose-chat glass specular rounded-[20px] rounded-bl-[8px] px-4 py-3 text-[15.5px] leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => (href?.startsWith("/") ? <Link href={href} className="font-medium text-accent-strong underline underline-offset-2">{children}</Link> : <a href={href} target="_blank" rel="noreferrer" className="text-accent-strong underline">{children}</a>) }}>
                  {part.text}
                </ReactMarkdown>
              </div>
            );
          }
          if (part.type.startsWith("tool-")) {
            const tp = part as { type: string; state?: string; input?: unknown; output?: unknown };
            const name = part.type.replace(/^tool-/, "").replace(/_/g, " ");
            const done = tp.state === "output-available";
            return (
              <div key={i} className="inline-flex items-center gap-1.5 rounded-full bg-fg/5 px-2.5 py-1 text-[12px] text-fg-3">
                <Sparkles size={11} className={done ? "" : "animate-pulse text-accent-strong"} /> {done ? name : `${name}…`}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

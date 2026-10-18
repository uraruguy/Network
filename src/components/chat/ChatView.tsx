"use client";
import type { UIMessage } from "ai";
import { History, SquarePen, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { SkeletonText } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";
import { useCacheReady, useReadyData } from "@/lib/offline/useCacheReady";
import { useChatThread, useChatTurnFinished } from "@/lib/queries/chat";
import { useProfile } from "@/lib/queries/misc";
import { usePersonDetail } from "@/lib/queries/people";
import { ChatSession, type ChatModelChoice } from "./ChatSession";
import { ThreadsSheet } from "./ThreadsSheet";
import "./chat.css";

/*
 * The Chat screen. URL: /chat (new conversation), /chat?t=<thread id>, /chat?person=<id>
 * (a new conversation about one person, e.g. from their profile).
 *
 * A new conversation gets a client-generated id. When its first message is sent the URL is
 * updated in place (history.replaceState) to ?t=<id>, so the session isn't remounted mid-stream
 * and a reload reopens the same thread.
 */

const MODEL_KEY = "chat-model";
const modelListeners = new Set<() => void>();

function readModel(): ChatModelChoice {
  try {
    return localStorage.getItem(MODEL_KEY) === "fast" ? "fast" : "smart";
  } catch {
    return "smart";
  }
}

/** The Smart/Fast choice, remembered on this device. */
function useModelChoice(): [ChatModelChoice, (m: ChatModelChoice) => void] {
  const model = useSyncExternalStore(
    (cb) => {
      modelListeners.add(cb);
      return () => modelListeners.delete(cb);
    },
    readModel,
    () => "smart" as const,
  );
  const set = useCallback((m: ChatModelChoice) => {
    try {
      localStorage.setItem(MODEL_KEY, m);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
    modelListeners.forEach((l) => l());
  }, []);
  return [model, set];
}

export function ChatView() {
  const params = useSearchParams();
  const router = useRouter();
  const urlThread = params.get("t");
  const urlPerson = params.get("person");

  // The id a new, unsaved conversation will get.
  const [freshId, setFreshId] = useState(() => crypto.randomUUID());
  const threadId = urlThread ?? freshId;
  const isFresh = threadId === freshId;

  // Cached data only once it may render (see useCacheReady): the server render and the
  // hydration render then agree (thread skeleton, generic starters).
  const cacheReady = useCacheReady();
  const thread = useChatThread(isFresh ? null : threadId);
  const threadData = cacheReady ? thread.data : undefined;
  const personId = urlPerson ?? threadData?.personId ?? null;
  const person = useReadyData(usePersonDetail(personId));
  const profile = useReadyData(useProfile());
  const [model, setModel] = useModelChoice();
  const [historyOpen, setHistoryOpen] = useState(false);
  const turnFinished = useChatTurnFinished();

  const startNew = () => {
    setFreshId(crypto.randomUUID());
    // In place (no navigation): Next keeps useSearchParams in sync with history.replaceState.
    window.history.replaceState(null, "", "/chat");
  };

  const onStarted = useCallback(
    (id: string) => {
      const q = new URLSearchParams({ t: id });
      if (urlPerson) q.set("person", urlPerson);
      window.history.replaceState(null, "", `/chat?${q}`);
    },
    [urlPerson],
  );

  const homeCity = profile?.homeLocation?.name ?? null;
  const loading = !isFresh && (!cacheReady || thread.isPending);
  const notFound = cacheReady && !isFresh && thread.isError;

  return (
    <div className="flex h-[calc(100dvh-84px-var(--sab)-12px-var(--sat))] flex-col lg:h-[calc(100dvh-64px)]">
      <header className="mx-auto mb-2 flex w-full max-w-[760px] items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="text-title1 text-fg">Chat</h1>
          {person && (
            <span className="inline-flex h-7 min-w-0 items-center gap-1 rounded-full bg-accent-soft pr-1 pl-2.5 text-footnote font-medium text-accent-text">
              <span className="truncate">{person.displayName}</span>
              {urlPerson && isFresh && (
                <button type="button" onClick={() => window.history.replaceState(null, "", "/chat")} aria-label="Not about this person" className="pressable grid size-5 place-items-center rounded-full hover:bg-accent-soft">
                  <X size={12} strokeWidth={2.6} />
                </button>
              )}
            </span>
          )}
        </div>
        <Tooltip content="Conversations">
          <IconButton label="Conversations" icon={<History />} variant="glass" onClick={() => setHistoryOpen(true)} />
        </Tooltip>
        <Tooltip content="New chat">
          <IconButton label="New chat" icon={<SquarePen />} variant="glass" onClick={() => startNew()} />
        </Tooltip>
      </header>

      {loading ? (
        <div className="mx-auto w-full max-w-[760px] space-y-6 pt-4">
          <SkeletonText lines={2} className="ml-auto w-1/2" />
          <SkeletonText lines={4} />
        </div>
      ) : notFound ? (
        <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-headline text-fg">This conversation is gone.</p>
          <button type="button" className="text-subhead text-accent-text" onClick={() => startNew()}>
            Start a new one
          </button>
        </div>
      ) : (
        <ChatSession
          key={threadId}
          threadId={threadId}
          initialMessages={isFresh ? [] : ((threadData?.messages ?? []) as UIMessage[])}
          personId={isFresh ? urlPerson : null}
          personName={person?.displayName ?? null}
          homeCity={homeCity}
          model={model}
          onModelChange={setModel}
          onStarted={onStarted}
          onTurnFinished={turnFinished}
        />
      )}

      <ThreadsSheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        activeId={isFresh ? null : threadId}
        onOpen={(id) => {
          setHistoryOpen(false);
          if (id !== threadId) router.push(`/chat?t=${id}`);
        }}
      />
    </div>
  );
}

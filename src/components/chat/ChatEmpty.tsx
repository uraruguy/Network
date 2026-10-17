"use client";
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { listItem, useMotionSafe } from "@/lib/motion";

/** First screen of a conversation: what the assistant can do, plus one-tap starters. */
export function ChatEmpty({ personName, homeCity, onPick }: { personName: string | null; homeCity: string | null; onPick: (text: string) => void }) {
  const safe = useMotionSafe();
  const first = personName?.split(/\s+/)[0] ?? null;
  const suggestions = personName
    ? [
        `What did ${first} and I discuss last time?`,
        `Summarize what I know about ${first}`,
        `Who introduced me to ${first}?`,
        `Remind me to follow up with ${first} in 3 months`,
      ]
    : [
        "Who should I follow up with this week?",
        "Who haven't I talked to in a while?",
        homeCity ? `Who do I know in ${homeCity}?` : "Who do I know abroad?",
        homeCity ? `Who could I go hiking with in ${homeCity}?` : "Who could I go hiking with?",
        "What happened in my network in the last 30 days?",
        "Who are my mentors, and when did we last talk?",
      ];

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center gap-6 py-10 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-accent-soft text-accent-text specular" aria-hidden>
        <Sparkles size={28} />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-title2 text-fg">{personName ? `Ask about ${personName}` : "Ask your network"}</h2>
        <p className="text-subhead text-balance text-fg-2">
          {personName ? "Answers come from your notes, follow-ups and their profile." : "It reads your people, notes and follow-ups — and can add notes and reminders for you."}
        </p>
      </div>
      <ul className="grid w-full gap-2 sm:grid-cols-2">
        {suggestions.map((s, i) => (
          <motion.li key={s} variants={listItem} custom={i} initial={safe ? "initial" : false} animate="animate">
            <button
              type="button"
              onClick={() => onPick(s)}
              className="pressable surface flex min-h-12 w-full items-center rounded-md px-4 py-2.5 text-left text-subhead text-fg-2 hover:bg-surface-2 hover:text-fg"
            >
              {s}
            </button>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

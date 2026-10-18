"use client";
import { Capture } from "./Capture";
import { FollowUps } from "./FollowUps";
import { Reconnect } from "./Reconnect";
import { RecentNotes } from "./RecentNotes";
import { StatTiles } from "./StatTiles";
import { TodayHeader } from "./TodayHeader";

/**
 * Today: greeting, quick capture (+ inbox), headline numbers, what's due, the week ahead,
 * people worth reconnecting with and recent notes. Two columns from xl.
 *
 * Every section renders its own skeleton until `useQueryReady()` (hydrated + cache restored + data),
 * so the server render, hydration and a cold start all show the same layout.
 */
export function TodayView() {
  return (
    <>
      <TodayHeader />
      <Capture />
      <div className="mt-6">
        <StatTiles />
      </div>
      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:gap-10">
        <div className="min-w-0">
          <FollowUps />
        </div>
        <div className="min-w-0 space-y-8">
          <Reconnect />
          <RecentNotes />
        </div>
      </div>
    </>
  );
}

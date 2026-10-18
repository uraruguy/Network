import { ViewTransition, type ReactNode } from "react";

/**
 * Page transition vocabulary (React <ViewTransition> + View Transitions API).
 *
 * Every navigation can carry one transition type; <PageTransition> (mounted by AppShell around
 * every page) maps it to an animation in app/transitions.css:
 *
 *   tab          tab bar / sidebar switches            crossfade
 *   nav-forward  drill-in (list → person → note)       phone: iOS push · desktop: 24px slide + fade
 *   nav-back     explicit back links                   the reverse
 *
 * Usage:
 *   <Link href={`/people/${id}`} transitionTypes={NAV_FORWARD}>…</Link>
 *   <Link href="/people" transitionTypes={NAV_BACK}>People</Link>
 *   router.push(`/people/${id}`, { transitionTypes: NAV_FORWARD });
 *
 * Navigations without a type (redirects, router.refresh, filter changes) don't animate, and
 * neither does browser back/forward: React renders popstate navigations synchronously (so the
 * browser can restore scroll position), and synchronous renders never start a view transition.
 * In-app back buttons should be links with NAV_BACK — PageHeader's `back` prop does this.
 */
export type TransitionType = "tab" | "nav-forward" | "nav-back";

export const TAB: string[] = ["tab"];
export const NAV_FORWARD: string[] = ["nav-forward"];
export const NAV_BACK: string[] = ["nav-back"];

// enter/exit classes per type; the CSS picks phone vs desktop keyframes with media queries.
const ENTER = { tab: "tab-in", "nav-forward": "push-in", "nav-back": "pop-in", default: "none" };
const EXIT = { tab: "tab-out", "nav-forward": "push-out", "nav-back": "pop-out", default: "none" };

/**
 * One page's transition boundary. AppShell renders it around `children` with `key={pathname}`:
 * layouts persist across navigations (a plain wrapper would only ever "update"), the key turns
 * each navigation into an exit (old page) + enter (new page) pair that the types above animate.
 * The wrapper div is the snapshot: it spans the content column and at least the viewport height.
 */
export function PageTransition({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <ViewTransition enter={ENTER} exit={EXIT} default="none">
      <div className={className}>{children}</div>
    </ViewTransition>
  );
}

/* ---------------------------------------------------------------- */
/*  Shared-element morphs                                            */
/* ---------------------------------------------------------------- */

/** `view-transition-name` for a person's avatar. Must be unique on screen. */
export function avatarTransitionName(personId: string): string {
  return `avatar-${personId}`;
}

/**
 * Morphs its child between two screens that both render the same `name` (one leaving, one
 * arriving in the same navigation). Dormant otherwise: the name is only applied while a pair
 * exists, so unrelated transitions (tab switches, filters) never capture it. Render at most one
 * per person per screen.
 *
 *   // PersonRow (list)                                   // PersonDetail (hero)
 *   <AvatarTransition personId={p.id}>                    <AvatarTransition personId={p.id}>
 *     <Avatar name={p.displayName} size={40} />             <Avatar name={p.displayName} size={88} />
 *   </AvatarTransition>                                   </AvatarTransition>
 *
 * The morph only plays when the destination renders the avatar in the navigation's commit
 * (render the hero from cached data — e.g. the people index row — instead of a skeleton).
 * The child must be a single DOM element (Avatar is).
 */
export function SharedTransition({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}

export function AvatarTransition({ personId, children }: { personId: string; children: ReactNode }) {
  return <SharedTransition name={avatarTransitionName(personId)}>{children}</SharedTransition>;
}

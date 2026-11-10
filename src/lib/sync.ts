"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useOffline } from "next/offline";
import { useSyncExternalStore } from "react";
import {
  addEntries,
  copyDay,
  createActivityType,
  createHorse,
  deleteEntry,
  deleteHorse,
  refreshPage,
  reorderActivityTypes,
  saveEntryNote,
  setActivityArchived,
  setEntryActivities,
  setEntryStatus,
  setHorseArchived,
  updateActivityType,
  updateHorse,
} from "@/app/actions";
import { toast } from "@/components/toast";
import { clerk, currentUser, usesClerk } from "./account";
import { patchDayCopies } from "./day-copy";
import { busyEditing } from "./editing";
import type { ActionResult, SyncResult } from "./action-result";

/*
 * Every change goes through here. It is
 *  - saved on the phone first (localStorage), so nothing is lost if the
 *    signal drops or iOS closes the app before it reaches the server;
 *  - sent strictly in order, one at a time: only the oldest change is ever
 *    sent, and if it fails everything behind it waits (a check-off can't
 *    reach the server before the entry it belongs to). The one exception: a
 *    failed change that a newer one for the same thing has replaced (an older
 *    copy of a note) is dropped rather than retried over the newer one;
 *  - sent with a fresh sign-in token. Clerk's token lasts a minute and the
 *    server can't renew it on a save, so after the phone has been locked we
 *    renew it first, and retry if the server still says signed out. If Clerk
 *    can't be reached that's treated as "try again later", not "signed out";
 *  - tied to the account that made it, so it's never sent to another one.
 *
 * Only the page reload (refreshPage) passes persist: false: it changes
 * nothing, so it goes through the same line but isn't stored on the phone.
 */

const ACTIONS = {
  addEntries,
  copyDay,
  createActivityType,
  createHorse,
  deleteEntry,
  deleteHorse,
  refreshPage,
  reorderActivityTypes,
  saveEntryNote,
  setActivityArchived,
  setEntryActivities,
  setEntryStatus,
  setHorseArchived,
  updateActivityType,
  updateHorse,
};

export type ActionName = keyof typeof ACTIONS;

export type OutboxItem = {
  id: string;
  name: ActionName;
  args: unknown[];
  /** A newer write with the same key replaces this one if it hasn't been sent yet. */
  key?: string;
  /** Display-only details used to show the change before the server has it. */
  meta?: unknown;
  createdAt: number;
  attempts: number;
  /** The Clerk account that made the change (null without Clerk, e.g. local dev). */
  userId?: string | null;
};

type RunOptions = {
  key?: string;
  meta?: unknown;
  /** Keep on the phone until it succeeds (default). Only the page reload passes false. */
  persist?: boolean;
  /**
   * A newer change with the same key takes the place in line of the one it
   * replaces (default), since changes made since may depend on it (a day's
   * line needs its horse). Pass false where the steps in between depend on
   * the order they were made in instead (work-type names must stay unique at
   * every step), so the newer change goes to the back of the line.
   */
  replaceInPlace?: boolean;
  /**
   * Called once the change has been handed to the server, or once it's clear
   * it won't be right now. To change page because of a save, do it from here:
   * a page change started before the save is handed over would wait for the
   * server's answer (see "page changes" below); one started after doesn't.
   */
  onSend?: () => void;
};

const STORAGE_KEY = "barnbook:outbox:v1";
const EMPTY: OutboxItem[] = [];

// ---------- Clerk ----------

type Renewal = "renewed" | "signed-out" | "unknown";

/** Clerk has loaded and is sure nobody is signed in (not just unable to check). */
function clerkSaysSignedOut() {
  const c = clerk();
  return usesClerk() && Boolean(c?.loaded) && !c?.user && (c?.status === "ready" || c?.status === undefined);
}

function isMine(item: OutboxItem, me: string | null | undefined = currentUser()) {
  return !item.userId || me === undefined || item.userId === me;
}

async function waitForClerk(ms = 8000) {
  if (!usesClerk()) return;
  const start = Date.now();
  while (!clerk()?.loaded && Date.now() - start < ms) await new Promise((r) => setTimeout(r, 200));
}

/**
 * Makes sure the sign-in cookie is current before a save. Cheap when the token
 * is still valid; after the phone has been locked it fetches a new one.
 * "unknown" means Clerk couldn't be asked (not loaded, offline, too slow).
 */
export async function renewSession(force = false): Promise<Renewal> {
  if (!usesClerk()) return "renewed";
  const c = clerk();
  if (!c?.loaded) return "unknown";
  if (!c.session) return c.status === "ready" || c.status === undefined ? "signed-out" : "unknown";
  try {
    const token = await Promise.race([
      c.session.getToken(force ? { skipCache: true } : undefined),
      new Promise<undefined>((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (token === undefined) return "unknown";
    return token ? "renewed" : "signed-out";
  } catch {
    return "unknown";
  }
}

// ---------- the stored outbox ----------

let items: OutboxItem[] | null = null;
/**
 * Waiting changes can't go out right now: the last try failed, sign-in isn't
 * ready, or the rider is signed out. Screens say so (strip, "Not synced yet")
 * until a save gets through, rather than going by attempt counts.
 */
let stuck = false;
/**
 * Saves handed to the server that have had no answer for a while: on a
 * connection that hangs instead of failing, nothing fails, so without this
 * the screen would look synced for as long as the request hangs.
 */
let slowSends = 0;
/**
 * The server can't be reached although Next hasn't noticed (Wi-Fi with no
 * internet, one bar): the app's own checks keep failing. Cleared as soon as
 * the server answers anything.
 */
let unreachable = false;
/** Changes the server just confirmed, still layered on screen until the page data catches up. */
let recent: { item: OutboxItem; at: number }[] = [];
const listeners = new Set<() => void>();

function isItem(value: unknown): value is OutboxItem {
  const v = value as OutboxItem;
  return Boolean(v) && typeof v.id === "string" && typeof v.name === "string" && v.name in ACTIONS && Array.isArray(v.args);
}

function stored(): OutboxItem[] {
  if (items === null) {
    if (typeof window === "undefined") return EMPTY;
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      items = Array.isArray(parsed) ? parsed.filter(isItem) : [];
    } catch {
      items = [];
    }
  }
  return items;
}

function emit() {
  for (const listener of listeners) listener();
}

function commit(next: OutboxItem[]) {
  items = next;
  if (!next.some((i) => isMine(i))) stuck = false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or full storage: still works for this session.
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Which changes are "mine" depends on Clerk, which loads after the page.
  let poll: ReturnType<typeof setInterval> | undefined;
  if (usesClerk() && !clerk()?.loaded) {
    poll = setInterval(() => {
      if (clerk()?.loaded) {
        clearInterval(poll);
        listener();
      }
    }, 300);
  }
  return () => {
    listeners.delete(listener);
    clearInterval(poll);
  };
}

let pendingCache: { from: OutboxItem[]; me: string | null | undefined; value: OutboxItem[] } | null = null;
let overlayCache: {
  from: OutboxItem[];
  recent: typeof recent;
  me: string | null | undefined;
  value: OutboxItem[];
} | null = null;

function pendingSnapshot(): OutboxItem[] {
  const from = stored();
  const me = currentUser();
  if (pendingCache?.from !== from || pendingCache.me !== me) {
    pendingCache = { from, me, value: from.filter((i) => isMine(i, me)) };
  }
  return pendingCache.value;
}

function overlaySnapshot(): OutboxItem[] {
  const from = stored();
  const me = currentUser();
  if (overlayCache?.from !== from || overlayCache.recent !== recent || overlayCache.me !== me) {
    overlayCache = { from, recent, me, value: [...recent.map((r) => r.item), ...pendingSnapshot()] };
  }
  return overlayCache.value;
}

function setStuck(value: boolean) {
  if (stuck === value) return;
  stuck = value;
  emit();
}

function setUnreachable(value: boolean) {
  if (unreachable === value) return;
  unreachable = value;
  emit();
}

/** Waiting changes can't get through right now (see `stuck`), or the server is taking too long to answer one. */
export function useSyncStuck(): boolean {
  return useSyncExternalStore(subscribe, () => stuck || slowSends > 0, () => false);
}

/**
 * No signal: Next knows it's offline, or the server can't be reached even
 * though the phone says it's online (see `unreachable`).
 */
export function useNoSignal(): boolean {
  const offline = useOffline();
  const cantReach = useSyncExternalStore(subscribe, () => unreachable, () => false);
  return offline || cantReach;
}

/** Changes saved on this phone (for this account) that the server hasn't confirmed yet. */
export function usePendingWrites(): OutboxItem[] {
  return useSyncExternalStore(subscribe, pendingSnapshot, () => EMPTY);
}

/** Pending changes plus ones just confirmed, for drawing the screen without flicker. */
export function useOverlayWrites(): OutboxItem[] {
  return useSyncExternalStore(subscribe, overlaySnapshot, () => EMPTY);
}

/** The page has new data from the server: stop layering changes it already includes. */
export function forgetConfirmedBefore(time: number) {
  const next = recent.filter((r) => r.at >= time);
  if (next.length !== recent.length) {
    recent = next;
    emit();
  }
}

function remember(item: OutboxItem) {
  const at = Date.now();
  // A newer confirmed change to the same thing replaces the older one: they
  // expire one by one, and the older must never outlive it on screen.
  const sameThing = (r: { item: OutboxItem }) =>
    item.key !== undefined && r.item.key === item.key && (r.item.userId ?? null) === (item.userId ?? null);
  recent = [...recent.filter((r) => !sameThing(r)), { item, at }];
  emit();
  // Normally the page's fresh data arrives first (forgetConfirmedBefore). This
  // is a fallback in case that page never refreshes — but not while the queue
  // is still working, because Next applies new page data at the end of a burst.
  const expire = () => {
    if (stored().some((i) => isMine(i)) || transient.size > 0 || started.size > 0) {
      setTimeout(expire, 5_000);
      return;
    }
    const next = recent.filter((r) => r.item.id !== item.id);
    if (next.length !== recent.length) {
      recent = next;
      emit();
    }
  };
  setTimeout(expire, 15_000);
}

/** Drops these unsent changes (after the user chose to sign out without them). */
export function discard(ids: string[]) {
  commit(stored().filter((i) => !ids.includes(i.id)));
}

// ---------- page changes ----------

/*
 * Next runs page changes and saves one after the other and shows the result
 * of whichever started last. So a save handed over while a page is still
 * loading holds that page back until the server answers the save, which with
 * a weak signal can take a long time. Before sending anything, the queue lets
 * a page change that's under way land first (waiting a few seconds at most).
 */

let movingTo: { url: string; from: string } | null = null;
let watchingPageChanges = false;
const ignoredClicks = new WeakSet<Event>();

/** A tap on a link that the app cancelled (e.g. no signal): it won't change page. */
export function ignoreClick(event: Event) {
  ignoredClicks.add(event);
}

function isCurrentPage(url: string) {
  const to = new URL(url, window.location.href);
  return to.pathname === window.location.pathname && to.search === window.location.search;
}

/** Call when the app starts a page change itself (router.push / replace). */
export function notePageChange(url: string) {
  if (typeof window === "undefined") return;
  // Going to the page you're on cancels a page change that's still loading
  // (Next keeps only the newest), so there's then nothing to wait for.
  movingTo = isCurrentPage(url) ? null : { url: new URL(url, window.location.href).href, from: window.location.href };
}

/**
 * Links and search forms: by the time the event bubbles up to the document,
 * Next has claimed (preventDefault) the ones it turns into a page change.
 */
function watchPageChanges() {
  if (watchingPageChanges || typeof document === "undefined") return;
  watchingPageChanges = true;
  document.addEventListener("click", (e) => {
    if (!e.defaultPrevented || ignoredClicks.has(e) || !(e.target instanceof Element)) return;
    const link = e.target.closest("a[href]");
    if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download")) return;
    if (link.origin !== window.location.origin || (link.target && link.target !== "_self")) return;
    notePageChange(link.href);
  });
  document.addEventListener("submit", (e) => {
    // next/form (History search): a GET form with an action. The app's other
    // forms have no action and never change page.
    const form = e.target;
    if (!e.defaultPrevented || !(form instanceof HTMLFormElement)) return;
    const action = form.getAttribute("action");
    if (action === null || form.method.toLowerCase() !== "get") return;
    const url = new URL(action, window.location.href);
    for (const [name, value] of new FormData(form)) if (typeof value === "string") url.searchParams.append(name, value);
    notePageChange(url.href);
  });
  // Back/forward: Next restores the page at once; whatever was loading is moot.
  window.addEventListener("popstate", () => {
    movingTo = null;
  });
}

/** A page change the app knows about is still loading. */
export function isPageChangePending() {
  return movingTo !== null && typeof window !== "undefined" && window.location.href === movingTo.from;
}

/** Waits (15 s at most, from now) while a page change is still loading. */
async function pageChangeLanded(ms = 15_000) {
  const start = Date.now();
  while (movingTo && window.location.href === movingTo.from && Date.now() - start < ms) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  movingTo = null;
}

// ---------- sending, one at a time ----------

let tail: Promise<void> = Promise.resolve();
/** The oldest change failed and is waiting for its retry: nothing after it may be sent. */
let blocked = false;
const scheduled = new Set<string>();
const started = new Set<string>();
const waiters = new Map<string, (result: SyncResult) => void>();
const sendHooks = new Map<string, () => void>();
const transient = new Map<string, OutboxItem>();

export function run<N extends ActionName>(
  name: N,
  args: Parameters<(typeof ACTIONS)[N]>,
  { key, meta, persist = true, onSend, replaceInPlace = true }: RunOptions = {},
): Promise<SyncResult> {
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    name,
    args: args as unknown[],
    key,
    meta,
    createdAt: Date.now(),
    attempts: 0,
    userId: currentUser() ?? null,
  };
  watchPageChanges();
  const done = new Promise<SyncResult>((resolve) => waiters.set(item.id, resolve));
  if (onSend) sendHooks.set(item.id, onSend);

  if (persist) {
    let next = [...stored()];
    let at = next.length;
    if (key) {
      const replaced = next.filter((i) => i.key === key && !started.has(i.id) && isMine(i));
      for (const old of replaced) settle(old.id, { ok: false, reason: "replaced" });
      // Take the place of the change it replaces, not the back of the line:
      // changes made since may depend on it (a day's line needs its horse).
      if (replaced.length && replaceInPlace) at = next.indexOf(replaced[0]!);
      next = next.filter((i) => !replaced.includes(i));
    }
    next.splice(at, 0, item);
    commit(next);
  } else {
    transient.set(item.id, item);
  }
  schedule(item.id);
  return done;
}

/** Sends anything still waiting on the phone (after a restart, reconnect, or resume). */
export function replay() {
  watchPageChanges();
  blocked = false;
  for (const item of stored()) schedule(item.id);
  sendRefresh();
}

/** Reloading the current page's data is wanted but hasn't gone through yet. */
let refreshWanted = false;
let refreshing = false;
let refreshWait: ReturnType<typeof setTimeout> | undefined;
/** No signal, as far as the app knows (AppLifecycle passes on useOffline). */
let knownOffline = false;

export function setKnownOffline(offline: boolean) {
  knownOffline = offline;
  if (!offline) sendRefresh();
}

/**
 * Reloads the current page's data (e.g. the app was left open overnight). Goes
 * through the queue, so an expired sign-in is renewed first, and keeps trying
 * until it works. Any successful save also does it, since saves refresh the page.
 */
export function refreshWhenPossible() {
  refreshWanted = true;
  sendRefresh();
}

function retryRefresh(ms: number) {
  refreshWait = setTimeout(() => {
    refreshWait = undefined;
    sendRefresh();
  }, ms);
}

let checksTimedOut = 0;
/** When the server last answered a save (a check that failed before then is moot). */
let lastAnswerAt = 0;

/**
 * The server answers at all (a quick check, so nothing is left for Next to
 * hold). A failed request means no signal at once; a check that only times
 * out (a slow start, or a connection that hangs) does after the second.
 */
async function reachable() {
  const startedAt = Date.now();
  try {
    await fetch(window.location.href, {
      method: "HEAD",
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(3000),
    });
    checksTimedOut = 0;
    setUnreachable(false);
    return true;
  } catch (error) {
    if (lastAnswerAt >= startedAt) return true; // a save got through meanwhile
    const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    checksTimedOut = timedOut ? checksTimedOut + 1 : 0;
    if (!timedOut || checksTimedOut >= 2) setUnreachable(true);
    return false;
  }
}

function sendRefresh() {
  // Also while "No signal" is on with no reload wanted: keep checking, so it
  // goes off as soon as the server answers.
  if ((!refreshWanted && !unreachable) || refreshing || refreshWait) return;
  // Not with no signal, nor under an open sheet: the reload can bring a new
  // day's list that replaces it. And only once the server answers, since
  // Next holds a reload it can't send and applies it the moment the signal
  // returns, whatever is open by then. Try again shortly.
  if (knownOffline) return; // setKnownOffline(false) tries again
  // While she's busy the reload waits; the check still runs while the server
  // is unreachable, so "No signal" goes as soon as it's back.
  if (busyEditing() && !unreachable) {
    retryRefresh(2000);
    return;
  }
  refreshing = true;
  void reachable().then((ok) => {
    if (!ok || knownOffline || busyEditing() || !refreshWanted) {
      refreshing = false;
      if (!knownOffline && (refreshWanted || unreachable)) retryRefresh(ok ? 2000 : 5000);
      return;
    }
    sendRefreshNow();
  });
}

function sendRefreshNow() {
  void run("refreshPage", [], { persist: false }).then((result) => {
    refreshing = false;
    if (result.ok) refreshWanted = false;
    else if (result.reason === "failed") scheduleRetry();
  });
}

let clerkWatch: ReturnType<typeof setInterval> | undefined;

/** Sign-in is still loading: go again the moment it's ready (no back-off). */
function replayWhenClerkLoads() {
  if (clerkWatch) return;
  clerkWatch = setInterval(() => {
    if (!clerk()?.loaded) return;
    clearInterval(clerkWatch);
    clerkWatch = undefined;
    replay();
  }, 300);
}

function schedule(id: string) {
  if (scheduled.has(id)) return;
  scheduled.add(id);
  tail = tail.then(() => process(id));
}

function settle(id: string, result: SyncResult) {
  sent(id);
  waiters.get(id)?.(result);
  waiters.delete(id);
}

function sent(id: string) {
  const hook = sendHooks.get(id);
  sendHooks.delete(id);
  hook?.();
}

async function send(item: OutboxItem): Promise<ActionResult> {
  await pageChangeLanded();
  const action = ACTIONS[item.name] as (...args: unknown[]) => Promise<ActionResult>;
  // A check-off queued by an older version doesn't say when it was finished:
  // send when it was made, so it keeps its place at the bottom of the list.
  const args =
    item.name === "setEntryStatus" && item.args.length < 3 ? [item.args[0], item.args[1], null, item.createdAt] : item.args;
  const reply = action(...args); // hands it to the router straight away
  sent(item.id);
  // No answer after a while: say the changes are waiting (see `slowSends`).
  let slow = false;
  const timer = setTimeout(() => {
    slow = true;
    slowSends += 1;
    emit();
  }, 8000);
  try {
    const result = await reply;
    if (!result || typeof result.ok !== "boolean") throw new Error(`Unexpected reply from ${item.name}`);
    // The server answered.
    lastAnswerAt = Date.now();
    checksTimedOut = 0;
    setUnreachable(false);
    return result;
  } finally {
    clearTimeout(timer);
    if (slow) {
      slowSends -= 1;
      emit();
    }
  }
}

/**
 * After a change didn't go through: drop it if a newer change replaces it
 * (returns true), else hold the queue.
 */
function hold(item: OutboxItem): boolean {
  const sameAccount = (i: OutboxItem) => (i.userId ?? null) === (item.userId ?? null);
  if (item.key !== undefined && stored().some((i) => i.key === item.key && i.id !== item.id && sameAccount(i))) {
    commit(stored().filter((i) => i.id !== item.id));
    return true;
  }
  blocked = true;
  return false;
}

async function process(id: string): Promise<void> {
  const isTransient = transient.has(id);
  const item = transient.get(id) ?? stored().find((i) => i.id === id);
  if (!item) {
    // Replaced by a newer write or discarded (already settled), or already sent.
    scheduled.delete(id);
    settle(id, { ok: false, reason: "replaced" });
    return;
  }

  if (!isTransient) {
    if (blocked) {
      // Something older is waiting for its retry; this goes after it.
      scheduled.delete(id);
      settle(id, { ok: false, reason: "failed" });
      return;
    }
    if (item.userId && currentUser() === undefined) {
      await waitForClerk(); // usually just a moment after the page loads
      if (currentUser() === undefined) {
        // Sign-in still loading: hold everything, in order, and go again as
        // soon as it's ready. Not a failure, so no back-off; but nothing can
        // go out meanwhile, so say so.
        blocked = true;
        setStuck(true);
        scheduled.delete(id);
        settle(id, { ok: false, reason: "failed" });
        replayWhenClerkLoads();
        return;
      }
    }
    const me = currentUser();
    if (item.userId && me === null && usesClerk()) {
      // Nobody is signed in now (the weekly sign-in ran out, or signed out on
      // another device). Everything stays on the phone, in order, and goes
      // out once the rider signs back in.
      blocked = true;
      setStuck(true);
      scheduled.delete(id);
      if (clerkSaysSignedOut()) {
        settle(id, { ok: false, reason: "signed-out" });
        goToSignIn();
      } else {
        settle(id, { ok: false, reason: "failed" });
        scheduleRetry();
      }
      return;
    }
    if (!isMine(item, me)) {
      // Made while signed in to another account: it waits for that account.
      scheduled.delete(id);
      settle(id, { ok: false, reason: "failed" });
      return;
    }
    const head = stored().find((i) => isMine(i, me));
    if (head && head.id !== id) {
      // Something older goes first.
      scheduled.delete(id);
      replay();
      return;
    }
  }

  started.add(id);
  try {
    await renewSession();
    let result = await send(item);
    let renewal: Renewal = "renewed";
    if (!result.ok && result.reason === "signed-out") {
      renewal = await renewSession(true);
      result = await send(item);
    }
    if (!result.ok && result.reason === "signed-out") {
      // Couldn't reach Clerk: that's no proof of being signed out. Retry later.
      if (renewal === "unknown") throw new Error("Couldn't renew the sign-in");
      // Really signed out (e.g. the weekly sign-in expired). The change stays
      // saved on the phone and goes out after signing back in.
      if (isTransient) {
        transient.delete(id);
      } else {
        hold(item);
        setStuck(true);
      }
      settle(id, result);
      goToSignIn();
      return;
    }
    // Done, or rejected for good (bad input): either way it leaves the outbox.
    if (isTransient) {
      transient.delete(id);
    } else {
      commit(stored().filter((i) => i.id !== id));
      setStuck(false); // the server answered
      if (result.ok) patchDayCopies(item); // the copies kept for offline use catch up
      // Made before the app was closed or reloaded, so no screen is waiting to
      // say it was refused: say it here.
      if (!result.ok && result.reason === "invalid" && !waiters.has(id)) toast(`${describe(item)}: ${result.error}`);
      if (result.ok) {
        remember(item);
        refreshWanted = false; // saves refresh the page too
      }
    }
    settle(id, result);
  } catch (error) {
    console.error(error);
    if (unstable_isUnrecognizedActionError(error)) reloadForNewVersion();
    let dropped = false;
    if (isTransient) {
      transient.delete(id);
    } else {
      commit(stored().map((i) => (i.id === id ? { ...i, attempts: i.attempts + 1 } : i)));
      dropped = hold(item);
      setStuck(true);
    }
    settle(id, dropped ? { ok: false, reason: "replaced" } : { ok: false, reason: "failed" });
    scheduleRetry();
  } finally {
    started.delete(id);
    scheduled.delete(id);
  }
}

/** Names a change in a message, for when it was made before the app restarted. */
function describe(item: OutboxItem): string {
  const name = (item.args[0] as { name?: unknown } | undefined)?.name;
  const called = typeof name === "string" ? name.trim() : "";
  switch (item.name) {
    case "updateActivityType":
      return called ? `Couldn’t rename a type of work to “${called}”` : "Couldn’t rename a type of work";
    case "createActivityType":
      return called ? `Couldn’t add “${called}”` : "Couldn’t add a type of work";
    case "updateHorse":
      return called ? `Couldn’t save the changes to ${called}` : "Couldn’t save a horse’s changes";
    case "createHorse":
      return called ? `Couldn’t add ${called}` : "Couldn’t add a horse";
    default:
      return "A change couldn’t be saved";
  }
}

let retryTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleRetry() {
  if (retryTimer || (stored().length === 0 && !refreshWanted)) return;
  const attempts = Math.max(1, ...stored().map((i) => i.attempts));
  const wait = Math.min(15_000 * 2 ** (attempts - 1), 5 * 60_000);
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    replay();
  }, wait);
}

let leaving = false;

function goToSignIn() {
  // Already there (a timer can still fire after a client-side sign-out).
  if (leaving || /^\/sign-(in|up)(\/|$)/.test(window.location.pathname)) return;
  leaving = true;
  // A full page load on purpose: it lets Clerk run its sign-in handshake,
  // which a client-side navigation can't.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(window.location.href)}`);
}

/** After a new deploy the old page can't call the new server; reload (the outbox survives). */
function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem("barnbook:reloaded-at") ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem("barnbook:reloaded-at", String(Date.now()));
  } catch {
    // ignore
  }
  window.location.reload();
}

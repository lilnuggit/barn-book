"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
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
 * Settings edits pass persist: false: they're sent in the same order but not
 * stored on the phone.
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
  /** Keep on the phone until it succeeds (default). Settings edits pass false. */
  persist?: boolean;
};

const STORAGE_KEY = "barnbook:outbox:v1";
const EMPTY: OutboxItem[] = [];

// ---------- Clerk ----------

type ClerkSession = { getToken(options?: { skipCache?: boolean }): Promise<string | null> };
type ClerkGlobal = { loaded?: boolean; status?: string; session?: ClerkSession | null; user?: { id: string } | null };
type Renewal = "renewed" | "signed-out" | "unknown";

function clerk(): ClerkGlobal | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as { Clerk?: ClerkGlobal }).Clerk;
}

/** The root layout marks <html data-auth="clerk"> unless running locally without sign-in. */
function usesClerk() {
  return typeof document !== "undefined" && document.documentElement.dataset.auth === "clerk";
}

/** The signed-in account: an id, null (no Clerk / signed out), or undefined (Clerk still loading). */
function currentUser(): string | null | undefined {
  if (!usesClerk()) return null;
  const c = clerk();
  if (!c?.loaded) return undefined;
  return c.user?.id ?? null;
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
  recent = [...recent, { item, at }];
  emit();
  // In case that page never refreshes (e.g. the user moved on).
  setTimeout(() => {
    const next = recent.filter((r) => r.item.id !== item.id);
    if (next.length !== recent.length) {
      recent = next;
      emit();
    }
  }, 15_000);
}

/** Drops these unsent changes (after the user chose to sign out without them). */
export function discard(ids: string[]) {
  commit(stored().filter((i) => !ids.includes(i.id)));
}

// ---------- sending, one at a time ----------

let tail: Promise<void> = Promise.resolve();
/** The oldest change failed and is waiting for its retry: nothing after it may be sent. */
let blocked = false;
const scheduled = new Set<string>();
const started = new Set<string>();
const waiters = new Map<string, (result: SyncResult) => void>();
const transient = new Map<string, OutboxItem>();

export function run<N extends ActionName>(
  name: N,
  args: Parameters<(typeof ACTIONS)[N]>,
  { key, meta, persist = true }: RunOptions = {},
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
  const done = new Promise<SyncResult>((resolve) => waiters.set(item.id, resolve));

  if (persist) {
    let next = stored();
    if (key) {
      const replaced = next.filter((i) => i.key === key && !started.has(i.id) && isMine(i));
      for (const old of replaced) settle(old.id, { ok: true });
      next = next.filter((i) => !replaced.includes(i));
    }
    commit([...next, item]);
  } else {
    transient.set(item.id, item);
  }
  schedule(item.id);
  return done;
}

/** Sends anything still waiting on the phone (after a restart, reconnect, or resume). */
export function replay() {
  blocked = false;
  for (const item of stored()) schedule(item.id);
}

function schedule(id: string) {
  if (scheduled.has(id)) return;
  scheduled.add(id);
  tail = tail.then(() => process(id));
}

function settle(id: string, result: SyncResult) {
  waiters.get(id)?.(result);
  waiters.delete(id);
}

async function send(item: OutboxItem): Promise<ActionResult> {
  const action = ACTIONS[item.name] as (...args: unknown[]) => Promise<ActionResult>;
  const result = await action(...item.args);
  if (!result || typeof result.ok !== "boolean") throw new Error(`Unexpected reply from ${item.name}`);
  return result;
}

/** After a change didn't go through: drop it if a newer change replaces it, else hold the queue. */
function hold(item: OutboxItem) {
  if (item.key !== undefined && stored().some((i) => i.key === item.key && i.id !== item.id)) {
    commit(stored().filter((i) => i.id !== item.id));
    return;
  }
  blocked = true;
}

async function process(id: string): Promise<void> {
  const isTransient = transient.has(id);
  const item = transient.get(id) ?? stored().find((i) => i.id === id);
  if (!item) {
    // Replaced by a newer write, cancelled, or already sent.
    scheduled.delete(id);
    settle(id, { ok: true });
    return;
  }

  if (!isTransient) {
    if (item.userId) await waitForClerk();
    const me = currentUser();
    if (!isMine(item, me)) {
      // Made while signed in to another account: it waits for that account.
      scheduled.delete(id);
      settle(id, { ok: false, reason: "failed" });
      return;
    }
    if (blocked) {
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
    if (item.userId && currentUser() === undefined) throw new Error("Sign-in isn't ready yet");
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
      if (isTransient) transient.delete(id);
      else hold(item);
      settle(id, result);
      goToSignIn();
      return;
    }
    // Done, or rejected for good (bad input): either way it leaves the outbox.
    if (isTransient) {
      transient.delete(id);
    } else {
      commit(stored().filter((i) => i.id !== id));
      if (result.ok) remember(item);
    }
    settle(id, result);
  } catch (error) {
    console.error(error);
    if (unstable_isUnrecognizedActionError(error)) reloadForNewVersion();
    if (isTransient) {
      transient.delete(id);
    } else {
      commit(stored().map((i) => (i.id === id ? { ...i, attempts: i.attempts + 1 } : i)));
      hold(item);
    }
    settle(id, { ok: false, reason: "failed" });
    scheduleRetry();
  } finally {
    started.delete(id);
    scheduled.delete(id);
  }
}

let retryTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleRetry() {
  if (retryTimer || stored().length === 0) return;
  const attempts = Math.max(1, ...stored().map((i) => i.attempts));
  const wait = Math.min(15_000 * 2 ** (attempts - 1), 5 * 60_000);
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    replay();
  }, wait);
}

let leaving = false;

function goToSignIn() {
  if (leaving) return;
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

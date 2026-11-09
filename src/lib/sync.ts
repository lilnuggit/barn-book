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
 *  - sent one at a time, in order, so an older note can never land after a
 *    newer one;
 *  - sent with a fresh sign-in token. Clerk's token lasts a minute and the
 *    server can't renew it on a save, so after the phone has been locked we
 *    renew it first, and retry once if the server still says signed out.
 */

const ACTIONS = {
  addEntries,
  copyDay,
  createActivityType,
  createHorse,
  deleteEntry,
  deleteHorse,
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
};

type RunOptions = {
  key?: string;
  meta?: unknown;
  /** Keep on the phone until it succeeds (default). Settings edits pass false. */
  persist?: boolean;
};

const STORAGE_KEY = "barnbook:outbox:v1";
const EMPTY: OutboxItem[] = [];

// ---------- the stored outbox ----------

let items: OutboxItem[] | null = null;
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

function commit(next: OutboxItem[]) {
  items = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or full storage: still works for this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Changes saved on this phone that the server hasn't confirmed yet. */
export function usePendingWrites(): OutboxItem[] {
  return useSyncExternalStore(subscribe, stored, () => EMPTY);
}

export function clearOutbox() {
  commit([]);
}

// ---------- sending, one at a time ----------

let tail: Promise<void> = Promise.resolve();
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
  };
  const done = new Promise<SyncResult>((resolve) => waiters.set(item.id, resolve));

  if (persist) {
    let next = stored();
    if (key) {
      const replaced = next.filter((i) => i.key === key && !started.has(i.id));
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

async function process(id: string): Promise<void> {
  const isTransient = transient.has(id);
  const item = transient.get(id) ?? stored().find((i) => i.id === id);
  if (!item) {
    // Replaced by a newer write, or already sent.
    scheduled.delete(id);
    settle(id, { ok: true });
    return;
  }
  started.add(id);
  try {
    await renewSession();
    let result = await send(item);
    if (!result.ok && result.reason === "signed-out") {
      await renewSession(true);
      result = await send(item);
    }
    if (!result.ok && result.reason === "signed-out") {
      // Really signed out (e.g. the weekly sign-in expired). The change stays
      // saved on the phone and goes out after signing back in.
      if (isTransient) transient.delete(id);
      settle(id, result);
      goToSignIn();
      return;
    }
    // Done, or rejected for good (bad input): either way it leaves the outbox.
    if (isTransient) transient.delete(id);
    else commit(stored().filter((i) => i.id !== id));
    settle(id, result);
  } catch (error) {
    console.error(error);
    if (unstable_isUnrecognizedActionError(error)) reloadForNewVersion();
    if (isTransient) transient.delete(id);
    else commit(stored().map((i) => (i.id === id ? { ...i, attempts: i.attempts + 1 } : i)));
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

// ---------- sign-in token ----------

type ClerkSession = { getToken(options?: { skipCache?: boolean }): Promise<string | null> };

/**
 * Makes sure the sign-in cookie is current before a save. Cheap when the token
 * is still valid; after the phone has been locked it fetches a new one.
 */
export async function renewSession(force = false): Promise<void> {
  if (typeof window === "undefined") return;
  const session = (window as unknown as { Clerk?: { session?: ClerkSession | null } }).Clerk?.session;
  if (!session) return;
  try {
    await Promise.race([
      session.getToken(force ? { skipCache: true } : undefined),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  } catch {
    // Offline or Clerk unreachable: send anyway, the server will tell us.
  }
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

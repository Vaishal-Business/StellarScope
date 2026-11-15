"use client";

import type { ClientAction } from "./assistant-tools";

/**
 * Bridges assistant / global UI actions to the sky viewer. When /explore is mounted it registers
 * a handler; otherwise actions are queued in sessionStorage and replayed after navigation.
 */
type Handler = (a: ClientAction) => boolean;
let handler: Handler | null = null;
const QUEUE = "spx-sky-queue";

export function registerSky(h: Handler) {
  handler = h;
  return () => {
    if (handler === h) handler = null;
  };
}

export function skyAvailable() {
  return handler !== null;
}

export function dispatchSky(a: ClientAction): boolean {
  if (handler) return handler(a);
  const q = JSON.parse(sessionStorage.getItem(QUEUE) ?? "[]") as ClientAction[];
  q.push(a);
  sessionStorage.setItem(QUEUE, JSON.stringify(q.slice(-10)));
  return false;
}

export function drainSkyQueue(): ClientAction[] {
  const q = JSON.parse(sessionStorage.getItem(QUEUE) ?? "[]") as ClientAction[];
  sessionStorage.removeItem(QUEUE);
  return q;
}

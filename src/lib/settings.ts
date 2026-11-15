"use client";

import { useEffect, useState } from "react";

export interface Settings {
  introVideo: boolean; // play the intro film on first load
  introAlways: boolean; // play it on every new session instead of only the first visit
  loadingSplash: boolean;
  aiProvider: "auto" | "ifm" | "nvidia";
  assistantDock: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_SETTINGS: Settings = { introVideo: true, introAlways: false, loadingSplash: true, aiProvider: "auto", assistantDock: true, reduceMotion: false };
const KEY = "spx-settings";
const EVT = "spx-settings-change";

export function readSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(patch: Partial<Settings>) {
  const next = { ...readSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVT));
  return next;
}

export function useSettings(): [Settings, (p: Partial<Settings>) => void] {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    const sync = () => setS(readSettings());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [s, (p) => setS(writeSettings(p))];
}

/** Remembers the last region the user inspected (powers "Continue exploring"). */
export function rememberRegion(r: { order: number; ipix: number; label?: string }) {
  try {
    localStorage.setItem("spx-last-region", JSON.stringify({ ...r, t: Date.now() }));
  } catch {}
}
export function lastRegion(): { order: number; ipix: number; label?: string; t: number } | null {
  try {
    return JSON.parse(localStorage.getItem("spx-last-region") ?? "null");
  } catch {
    return null;
  }
}

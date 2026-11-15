"use client";

import { AnimatePresence } from "motion/react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { themes, defaultThemeSlug } from "@/astryx-themes";
import { Splash } from "@/components/shell/splash";
import { IntroVideo } from "@/components/shell/intro-video";
import { SplashReady } from "@/components/motion/reveal";
import { CommandProvider } from "@/components/shell/command";
import { SessionProvider } from "@/lib/session";
import { AssistantDock, AssistantProvider } from "@/components/assistant/assistant";
import { readSettings } from "@/lib/settings";

type Phase = "boot" | "intro" | "splash" | "ready";

export function Providers({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("boot");

  useEffect(() => {
    const s = readSettings();
    const seenEver = localStorage.getItem("spx-intro-seen") === "1";
    const seenSession = sessionStorage.getItem("spx-intro-session") === "1";
    const wantIntro = s.introVideo && (!seenEver || (s.introAlways && !seenSession));
    const wantSplash = s.loadingSplash && !sessionStorage.getItem("spx-splash");
    setPhase(wantIntro ? "intro" : wantSplash ? "splash" : "ready");
  }, []);

  const introDone = useCallback(() => {
    localStorage.setItem("spx-intro-seen", "1");
    sessionStorage.setItem("spx-intro-session", "1");
    setPhase(readSettings().loadingSplash && !sessionStorage.getItem("spx-splash") ? "splash" : "ready");
  }, []);

  return (
    <Theme theme={themes[defaultThemeSlug]} mode="dark">
      <SessionProvider>
        <SplashReady.Provider value={phase === "ready"}>
          <CommandProvider>
            <AssistantProvider>
              <AnimatePresence>{phase === "intro" && <IntroVideo key="intro" onDone={introDone} />}</AnimatePresence>
              <Splash mode={phase === "boot" ? "cover" : phase === "splash" ? "run" : "off"} onDone={() => setPhase("ready")} />
              {children}
              <Suspense fallback={null}>
                <AssistantDock />
              </Suspense>
            </AssistantProvider>
          </CommandProvider>
        </SplashReady.Provider>
      </SessionProvider>
    </Theme>
  );
}

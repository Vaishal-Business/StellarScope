"use client";

import { useEffect, useState } from "react";
import { Laptop } from "lucide-react";
import { LogoMark } from "./logo";

/** StellarScope needs WebGL 3D, large canvases and in-browser SI inference: phones get a desktop prompt. */
export function MobileGate() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => {
      const ua = navigator.userAgent;
      const phoneUA = /Android.+Mobile|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(ua);
      setMobile(phoneUA || window.innerWidth < 768);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  if (!mobile) return null;
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[oklch(0.1_0.004_260)] px-8 text-center">
      <LogoMark className="size-12 text-white" />
      <div className="display mt-6 text-[20px] font-light tracking-[0.35em] text-white">STELLARSCOPE</div>
      <Laptop className="mt-10 size-10 text-signal" />
      <h1 className="mt-5 text-[18px] text-white">Open StellarScope on a desktop or laptop</h1>
      <p className="mt-3 max-w-sm text-[13.5px] leading-relaxed text-white/60">
        The 3D infrared sky, the 102-channel science viewer and our Spectral Scout SI model need a larger screen and a desktop-class browser. Please visit this site on a computer for the full experience.
      </p>
      <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">NASA SPHEREx DR1 · Team The Abyss</p>
    </div>
  );
}

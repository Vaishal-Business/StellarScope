"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type * as T3 from "three";
import { earthHelio, keplerPos, radecToEcl, type Elements, type V3 } from "@/lib/solar";

/**
 * Where Earth (and SPHEREx with it) was in its orbit for each epoch of a detection, with the
 * line of sight towards the object. If the object is a known asteroid, its real JPL orbit and
 * positions on the same dates are drawn too. Ecliptic J2000, 1 unit = 1 AU.
 */
export function Solar3D({ epochs, ra, dec, elements, className }: { epochs: { jd: number; label: string }[]; ra: number; dec: number; elements?: Elements | null; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = `${epochs.map((e) => e.jd.toFixed(1)).join(",")}|${ra.toFixed(3)}|${dec.toFixed(3)}|${elements?.a ?? 0}`;

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const el = ref.current;
      if (!el || disposed) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      el.appendChild(renderer.domElement);
      renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
      const world = new THREE.Group();
      scene.add(world);
      // ecliptic (x,y,z) -> scene (x, z, -y) so the ecliptic plane is horizontal
      const S = (v: V3) => new THREE.Vector3(v[0], v[2], -v[1]);
      const line = (pts: T3.Vector3[], color: number, opacity = 1, dashed = false) => {
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        const m = dashed ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.06, gapSize: 0.04 }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
        const l = new THREE.Line(g, m);
        if (dashed) l.computeLineDistances();
        world.add(l);
      };
      const dot = (p: T3.Vector3, color: number, r: number) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 20), new THREE.MeshBasicMaterial({ color }));
        m.position.copy(p);
        world.add(m);
        return m;
      };
      const label = (text: string, p: T3.Vector3, color = "#e8eefc") => {
        const c = document.createElement("canvas");
        c.width = 256;
        c.height = 64;
        const x = c.getContext("2d")!;
        x.font = "500 26px ui-monospace, monospace";
        x.fillStyle = color;
        x.fillText(text, 4, 40);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
        sp.scale.set(0.5, 0.125, 1);
        sp.position.copy(p).add(new THREE.Vector3(0.28, 0.1, 0));
        world.add(sp);
      };

      // Sun + glow
      dot(new THREE.Vector3(), 0xffd166, 0.07);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 24), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.18 }));
      world.add(glow);
      // Earth orbit
      const t0 = epochs[0]?.jd ?? 2461000;
      line(Array.from({ length: 181 }, (_, k) => S(earthHelio(t0 + (k / 180) * 365.25))), 0x5f8fd6, 0.6);
      // Asteroid orbit
      let maxR = 1.3;
      if (elements) {
        const per = 365.25 * Math.pow(elements.a, 1.5);
        const pts = Array.from({ length: 361 }, (_, k) => S(keplerPos(elements, t0 + (k / 360) * per)));
        line(pts, 0xff8bd1, 0.7);
        maxR = Math.max(maxR, elements.a * (1 + elements.e) + 0.2);
      }
      const dir = S(radecToEcl(ra, dec)).normalize();
      const colors = [0xb8f5c8, 0x7fd4ff, 0xffd166, 0xff8bd1, 0xc9a7ff];
      epochs.forEach((ep, i) => {
        const e = S(earthHelio(ep.jd));
        const col = colors[i % colors.length];
        dot(e, col, 0.045);
        label(ep.label, e, `#${col.toString(16).padStart(6, "0")}`);
        if (elements) {
          const a = S(keplerPos(elements, ep.jd));
          dot(a, col, 0.03);
          line([e, a], col, 0.8);
        } else {
          line([e, e.clone().add(dir.clone().multiplyScalar(maxR * 1.4))], col, 0.55, true);
        }
      });
      // ecliptic reference ring
      const ringPts = Array.from({ length: 129 }, (_, k) => new THREE.Vector3(Math.cos((k / 128) * Math.PI * 2) * maxR * 1.25, 0, Math.sin((k / 128) * Math.PI * 2) * maxR * 1.25));
      line(ringPts, 0xffffff, 0.06);

      const dist = maxR * 3.1;
      let az = 0.6, el2 = 0.55;
      const place = () => {
        camera.position.set(dist * Math.cos(el2) * Math.sin(az), dist * Math.sin(el2), dist * Math.cos(el2) * Math.cos(az));
        camera.lookAt(0, 0, 0);
      };
      place();
      const resize = () => {
        const w = el.clientWidth, h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();
      let drag: { x: number; y: number } | null = null;
      const down = (e: PointerEvent) => (drag = { x: e.clientX, y: e.clientY });
      const move = (e: PointerEvent) => {
        if (!drag) return;
        az -= (e.clientX - drag.x) * 0.008;
        el2 = Math.max(0.05, Math.min(1.5, el2 + (e.clientY - drag.y) * 0.006));
        drag = { x: e.clientX, y: e.clientY };
        place();
      };
      const up = () => (drag = null);
      el.addEventListener("pointerdown", down);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      let raf = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (!drag) {
          az += 0.0015;
          place();
        }
        renderer.render(scene, camera);
      };
      loop();
      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        el.removeEventListener("pointerdown", down);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={ref} className={cn("relative cursor-grab touch-none", className)} />;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * SPHEREx around Earth in 3D: the orbit is propagated with SGP4 from the current CelesTrak TLE
 * (NORAD 63182); the live position updates every second. Optional `exposures` are the real
 * geocentric spacecraft positions (X_SC/Y_SC/Z_SC, km) read from each L2 FITS header.
 */
export function Orbit3D({ exposures = [], className, onInfo }: { exposures?: { pos: [number, number, number]; label: string }[]; className?: string; onInfo?: (i: { alt: number; lat: number; lon: number; tle: string; period: number } | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const infoRef = useRef(onInfo);
  infoRef.current = onInfo;

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const [THREE, sat] = await Promise.all([import("three"), import("@/lib/sgp4")]);
      const el = ref.current;
      if (!el || disposed) return;
      let tle: string[] = [];
      try {
        const r = await fetch("/api/spherex/orbit");
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        tle = j.tle;
      } catch (e) {
        setError(`Orbit data unavailable: ${(e as Error).message}`);
      }
      const R = 1; // Earth radius units; 1 unit = 6371 km
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      el.appendChild(renderer.domElement);
      renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
      camera.position.set(0, 1.2, 4.4);
      camera.lookAt(0, 0, 0);
      const world = new THREE.Group();
      world.rotation.x = 0.35;
      scene.add(world);

      // Earth: dark ocean sphere with lat/lon graticule and a day/night terminator from the Sun direction
      const sunDir = new THREE.Vector3(1, 0.2, 0.4).normalize();
      const earth = new THREE.Mesh(
        new THREE.SphereGeometry(R, 96, 96),
        new THREE.ShaderMaterial({
          uniforms: { uSun: { value: sunDir } },
          vertexShader: `varying vec3 vN; void main(){ vN = normalize((modelMatrix*vec4(normal,0.)).xyz); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
          fragmentShader: `uniform vec3 uSun; varying vec3 vN; void main(){ float d = dot(vN,uSun); vec3 day = vec3(0.10,0.22,0.38); vec3 night = vec3(0.02,0.03,0.06); gl_FragColor = vec4(mix(night, day, smoothstep(-0.15,0.25,d)),1.); }`,
        }),
      );
      world.add(earth);
      const grid: number[] = [];
      for (let lat = -60; lat <= 60; lat += 30)
        for (let lon = 0; lon < 360; lon += 4) {
          const p = (la: number, lo: number) => [Math.cos((la * Math.PI) / 180) * Math.cos((lo * Math.PI) / 180) * 1.002, Math.sin((la * Math.PI) / 180) * 1.002, -Math.cos((la * Math.PI) / 180) * Math.sin((lo * Math.PI) / 180) * 1.002];
          grid.push(...p(lat, lon), ...p(lat, lon + 4));
        }
      for (let lon = 0; lon < 360; lon += 30)
        for (let lat = -88; lat < 88; lat += 4) {
          const p = (la: number, lo: number) => [Math.cos((la * Math.PI) / 180) * Math.cos((lo * Math.PI) / 180) * 1.002, Math.sin((la * Math.PI) / 180) * 1.002, -Math.cos((la * Math.PI) / 180) * Math.sin((lo * Math.PI) / 180) * 1.002];
          grid.push(...p(lat, lon), ...p(lat + 4, lon));
        }
      const gridGeo = new THREE.BufferGeometry();
      gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(grid, 3));
      world.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x5f8fd6, transparent: true, opacity: 0.25 })));

      // ECI (km) -> scene (Earth radii); scene Y is the celestial pole (ECI Z)
      const toScene = (v: { x: number; y: number; z: number }) => new THREE.Vector3(v.x / 6371, v.z / 6371, -v.y / 6371);

      // exposures from FITS headers
      if (exposures.length) {
        const pts = new Float32Array(exposures.length * 3);
        exposures.forEach((e, i) => {
          const s = toScene({ x: e.pos[0], y: e.pos[1], z: e.pos[2] });
          pts.set([s.x, s.y, s.z], i * 3);
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
        world.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd166, size: 0.05 })));
      }

      let satrec: ReturnType<typeof sat.twoline2satrec> | null = null;
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 16), new THREE.MeshBasicMaterial({ color: 0xb8f5c8 }));
      world.add(marker);
      if (tle.length >= 3) {
        satrec = sat.twoline2satrec(tle[1], tle[2]);
        const periodMin = (2 * Math.PI) / satrec.no;
        const path: number[] = [];
        const now = Date.now();
        for (let k = 0; k <= 240; k++) {
          const pv = sat.propagate(satrec, new Date(now + (k / 240) * periodMin * 60000));
          if (pv && pv.position && typeof pv.position !== "boolean") {
            const s = toScene(pv.position);
            path.push(s.x, s.y, s.z);
          }
        }
        const pg = new THREE.BufferGeometry();
        pg.setAttribute("position", new THREE.Float32BufferAttribute(path, 3));
        world.add(new THREE.Line(pg, new THREE.LineBasicMaterial({ color: 0xb8f5c8, transparent: true, opacity: 0.8 })));
      }

      const resize = () => {
        const w = el.clientWidth, h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();
      let drag: { x: number } | null = null;
      const down = (e: PointerEvent) => (drag = { x: e.clientX });
      const move = (e: PointerEvent) => {
        if (!drag) return;
        world.rotation.y += (e.clientX - drag.x) * 0.008;
        drag.x = e.clientX;
      };
      const up = () => (drag = null);
      el.addEventListener("pointerdown", down);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);

      let raf = 0;
      let lastInfo = 0;
      const loop = (t: number) => {
        raf = requestAnimationFrame(loop);
        if (!drag) world.rotation.y += 0.0012;
        if (satrec) {
          const d = new Date();
          const pv = sat.propagate(satrec, d);
          if (pv && pv.position && typeof pv.position !== "boolean") {
            marker.position.copy(toScene(pv.position));
            if (t - lastInfo > 1000) {
              lastInfo = t;
              const gd = sat.eciToGeodetic(pv.position, sat.gstime(d));
              infoRef.current?.({ alt: gd.height, lat: sat.degreesLat(gd.latitude), lon: sat.degreesLong(gd.longitude), tle: tle[0].trim(), period: (2 * Math.PI) / satrec.no });
            }
          }
        }
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(loop);
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
  }, [exposures.length]);

  return (
    <div className={cn("relative cursor-grab", className)} ref={ref}>
      {error && <div className="absolute inset-x-0 bottom-2 text-center text-[11px] text-warn">{error}</div>}
    </div>
  );
}

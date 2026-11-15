"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The real SPHEREx DR1 all-sky cube on an external "celestial globe" (seen from outside, so
 * east–west appear mirrored as on a classical celestial globe). False-colour IR composite with
 * a cinematic terminator and atmospheric rim.
 */
export function SkyGlobe({ className, frames = [62, 40, 5] as [number, number, number], speed = 0.04 }: { className?: string; frames?: [number, number, number]; speed?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { buildAllskyGeometry } = await import("@/sky/geometry");
      const { allskyUrl } = await import("@/sky/spherex");
      const el = ref.current;
      if (!el || disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      el.appendChild(renderer.domElement);
      renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
      camera.position.set(0, 0.35, 4.3);
      camera.lookAt(0, 0, 0);

      const load = (u: string) =>
        fetch(u, { cache: "force-cache" })
          .then((r) => r.blob())
          .then((b) => createImageBitmap(b, { imageOrientation: "flipY" }))
          .then((bmp) => {
            const t = new THREE.Texture(bmp);
            t.flipY = false;
            t.colorSpace = THREE.NoColorSpace;
            t.minFilter = THREE.LinearFilter;
            t.generateMipmaps = false;
            t.needsUpdate = true;
            return t;
          });
      const tex = await Promise.all(frames.map((f) => load(allskyUrl(f))));
      if (disposed) return;

      const geo = buildAllskyGeometry(1, 5);
      geo.computeVertexNormals();
      const mat = new THREE.ShaderMaterial({
        uniforms: { tR: { value: tex[0] }, tG: { value: tex[1] }, tB: { value: tex[2] }, uLight: { value: new THREE.Vector3(-0.35, 0.3, 1.0).normalize() }, uFade: { value: 0 } },
        vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ vUv=uv; vN = normalize(normalMatrix * normalize(position)); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform sampler2D tR; uniform sampler2D tG; uniform sampler2D tB; uniform vec3 uLight; uniform float uFade;
          varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){
            vec3 c = vec3(texture2D(tR,vUv).r, texture2D(tG,vUv).r, texture2D(tB,vUv).r);
            c = pow(clamp(c*1.25-0.02,0.,1.), vec3(0.95));
            float l = dot(c, vec3(.3,.59,.11)); c = mix(vec3(l), c, 1.35);
            float d = max(dot(normalize(vN), uLight), 0.0);
            float shade = 0.22 + 1.1*pow(d, 0.7);
            float rim = pow(1.0 - max(dot(normalize(vN), vV), 0.0), 3.0);
            vec3 col = c*shade + vec3(0.55,0.75,1.0)*rim*0.35;
            gl_FragColor = vec4(col*uFade, 1.0);
          }`,
      });
      const globe = new THREE.Mesh(geo, mat);
      globe.rotation.z = 0.41; // tilt like a celestial globe on its stand
      scene.add(globe);

      // atmosphere halo
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(1.045, 64, 64),
        new THREE.ShaderMaterial({
          uniforms: { uFade: { value: 0 } },
          vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
          fragmentShader: `uniform float uFade; varying vec3 vN; varying vec3 vV; void main(){ float d = clamp(-dot(vN, vV), 0.0, 1.0); float i = pow(1.0 - d, 6.0) * smoothstep(0.0, 0.25, d); gl_FragColor = vec4(vec3(0.62,0.82,1.0)*i*0.55*uFade, 1.0); }`,
          side: THREE.BackSide,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      scene.add(halo);

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      let drag: { x: number; v: number } | null = null;
      let spin = speed;
      const down = (e: PointerEvent) => (drag = { x: e.clientX, v: 0 });
      const move = (e: PointerEvent) => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        globe.rotation.y += dx * 0.006;
        drag.v = dx * 0.006;
        drag.x = e.clientX;
      };
      const up = () => {
        if (drag) spin = speed + drag.v * 20;
        drag = null;
      };
      el.addEventListener("pointerdown", down);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);

      let raf = 0;
      let last = performance.now();
      const t0 = last;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        spin += (speed - spin) * Math.min(1, dt * 1.5);
        if (!drag) globe.rotation.y += spin * dt;
        const f = Math.min(1, (now - t0) / 1600);
        mat.uniforms.uFade.value = f * f * (3 - 2 * f);
        halo.material.uniforms.uFade.value = mat.uniforms.uFade.value;
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(loop);
      setReady(true);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        el.removeEventListener("pointerdown", down);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        geo.dispose();
        mat.dispose();
        tex.forEach((t) => t.dispose());
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className={cn("relative cursor-grab active:cursor-grabbing", className, ready ? "" : "")} />;
}

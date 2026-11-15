import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { ang2pix, boundary, pix2ang, tileSizeDeg, type RaDec } from "./healpix";
import { radecToVec, vecToRadec, eclipticToRadec, galacticToRadec, formatRA } from "./coords";
import { buildAllskyGeometry, buildTileGeometry, tileBoundarySegments, tileOutline, tilesInCone } from "./geometry";
import { ImageLoader } from "./loader";
import { bitmapTexture, createSkyMaterial, type Colormap, type DisplayParams, DEFAULT_DISPLAY, COLORMAPS } from "./material";
import { HIPS, HIPS_BASE, allskyUrl, tileUrl, DEFAULT_RGB, isBlankFrame } from "./spherex";

/* ------------------------------------------------------------------ types */

export type ColorMode =
  | { kind: "rgb"; r: number; g: number; b: number }
  | { kind: "mono"; frame: number; cmap: Colormap };

export interface SkyLayers {
  imagery: boolean;
  grid: boolean;
  gridOrder: number | "auto";
  tileLabels: boolean;
  eqGrid: boolean;
  constellations: boolean;
  constellationNames: boolean;
  stars: boolean;
  starNames: boolean;
  ecliptic: boolean;
  galactic: boolean;
  status: string | null; // id of a status overlay supplied via statusProvider
}

export const DEFAULT_LAYERS: SkyLayers = {
  imagery: true,
  grid: true,
  gridOrder: "auto",
  tileLabels: false,
  eqGrid: true,
  constellations: true,
  constellationNames: true,
  stars: true,
  starNames: true,
  ecliptic: false,
  galactic: false,
  status: null,
};

export interface CameraState {
  ra: number;
  dec: number;
  fov: number; // vertical, degrees
}

export interface TileRef {
  order: number;
  ipix: number;
  center: RaDec;
}

export interface HoverInfo extends TileRef {
  pointer: RaDec;
  x: number;
  y: number;
}

export interface LoadingInfo {
  pending: number;
  loaded: number;
  failed: number;
  bytes: number;
  displayOrder: number;
  visibleTiles: number;
}

export interface SkyCatalog {
  constellations: { id: string; name: string; rank: number; ra: number; dec: number }[];
  lines: [number, number][][];
  stars: [number, number, number, number, string][]; // ra, dec, mag, bv, name
}

export type StatusProvider = (layer: string, order: number, ipix: number) => [number, number, number, number] | null;

export interface SkyEngineOptions {
  hipsBase?: string;
  initial?: Partial<CameraState>;
  layers?: Partial<SkyLayers>;
  color?: ColorMode;
  accent?: string;
  catalogUrl?: string;
  statusProvider?: StatusProvider;
  interactive?: boolean;
}

type Events = {
  ready: void;
  hover: HoverInfo | null;
  select: TileRef | null;
  camera: CameraState & { displayOrder: number; gridOrder: number; maxRes: boolean };
  loading: LoadingInfo;
  fps: number;
  error: string;
  dblclick: RaDec;
};

/* ------------------------------------------------------------------ helpers */

const DEG = Math.PI / 180;
const MIN_FOV = 0.6;
const MAX_FOV = 130;
const RADIUS = 1;
const MAX_TILE_ENTRIES = 220;

interface FrameSet {
  frames: [number, number, number];
  key: string;
}

function frameSet(c: ColorMode): FrameSet {
  const frames: [number, number, number] = c.kind === "rgb" ? [c.r, c.g, c.b] : [c.frame, c.frame, c.frame];
  return { frames, key: frames.join(",") };
}

interface TileEntry {
  key: string;
  order: number;
  ipix: number;
  geometry: THREE.BufferGeometry;
  mesh: THREE.Mesh | null; // currently displayed
  incoming: THREE.Mesh | null; // fading in (new wavelength)
  setKey: string | null; // frames of `mesh`
  loadingKey: string | null;
  lastUsed: number;
  empty: boolean; // 404 / no data
  fade: number;
}

/* ------------------------------------------------------------------ engine */

export class SkyEngine {
  readonly container: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private overlay: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D;
  private loader = new ImageLoader(12);
  private hipsBase: string;

  private state: CameraState = { ra: 266.4, dec: -29, fov: 90 };
  private target: { from: THREE.Quaternion; to: THREE.Quaternion; fov0: number; fov1: number; t: number; dur: number; toDir: THREE.Vector3 } | null = null;
  private velocity = { ra: 0, dec: 0 };
  private layers: SkyLayers;
  private color: ColorMode;
  private display: DisplayParams = { ...DEFAULT_DISPLAY };
  private statusProvider?: StatusProvider;
  private accent: string;

  private allsky: { mesh: THREE.Mesh | null; incoming: THREE.Mesh | null; setKey: string | null; loadingKey: string | null; geometry: THREE.BufferGeometry; fade: number };
  private tiles = new Map<string, TileEntry>();
  private gridLines: THREE.LineSegments;
  private statusMesh: THREE.Mesh;
  private eqGrid: THREE.LineSegments;
  private consLines: THREE.LineSegments;
  private eclipticLine: THREE.Line;
  private galacticLine: THREE.Line;
  private starPoints: THREE.Points | null = null;
  private hoverLine: LineSegments2;
  private selectLine: LineSegments2;
  private hoverFill: THREE.Mesh;
  private selectFill: THREE.Mesh;
  private catalog: SkyCatalog | null = null;

  private hovered: TileRef | null = null;
  private selected: TileRef | null = null;
  private gridKey = "";
  private eqKey = "";
  private displayOrder = 0;
  private gridOrderNow = 0;
  private visibleGrid: number[] = [];
  private dirty = true;
  private raf = 0;
  private lastFrame = performance.now();
  private fpsAcc = { n: 0, t: 0 };
  private frameCounter = 0;
  private disposed = false;
  private listeners: { [K in keyof Events]?: Set<(d: Events[K]) => void> } = {};
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; moved: number; t: number; pinch?: number; fov?: number } | null = null;
  private lastPointer: { x: number; y: number } | null = null;
  private resizeObs: ResizeObserver;
  private interactive: boolean;
  private tmpV = new THREE.Vector3();

  constructor(container: HTMLElement, opts: SkyEngineOptions = {}) {
    this.container = container;
    this.hipsBase = opts.hipsBase ?? HIPS_BASE;
    this.layers = { ...DEFAULT_LAYERS, ...opts.layers };
    this.color = opts.color ?? { kind: "rgb", ...DEFAULT_RGB };
    this.statusProvider = opts.statusProvider;
    this.accent = opts.accent ?? "#c6f6d5";
    this.interactive = opts.interactive ?? true;
    Object.assign(this.state, opts.initial);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x020306, 1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const c = this.renderer.domElement;
    c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none";
    container.appendChild(c);

    this.overlay = document.createElement("canvas");
    this.overlay.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    container.appendChild(this.overlay);
    this.ctx2d = this.overlay.getContext("2d")!;

    this.camera = new THREE.PerspectiveCamera(this.state.fov, 1, 0.001, 10);
    this.camera.position.set(0, 0, 0);

    // --- layers
    this.allsky = { mesh: null, incoming: null, setKey: null, loadingKey: null, geometry: buildAllskyGeometry(RADIUS), fade: 1 };

    this.gridLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthTest: false }),
    );
    this.gridLines.renderOrder = 20;
    this.gridLines.frustumCulled = false;
    this.scene.add(this.gridLines);

    this.statusMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false }),
    );
    this.statusMesh.renderOrder = 15;
    this.statusMesh.frustumCulled = false;
    this.scene.add(this.statusMesh);

    this.eqGrid = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x5f8fd6, transparent: true, opacity: 0.22, depthTest: false }),
    );
    this.eqGrid.renderOrder = 18;
    this.eqGrid.frustumCulled = false;
    this.scene.add(this.eqGrid);

    this.consLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x6aa0e8, transparent: true, opacity: 0.5, depthTest: false }),
    );
    this.consLines.renderOrder = 22;
    this.consLines.frustumCulled = false;
    this.scene.add(this.consLines);

    this.eclipticLine = this.makeCurve((t) => eclipticToRadec(t * 360), 0xe8b86a, 0.55);
    this.galacticLine = this.makeCurve((t) => galacticToRadec(t * 360, 0), 0xd88ad8, 0.45);

    const lm = (color: string, w: number, op: number) => {
      const m = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: w, transparent: true, opacity: op, depthTest: false });
      return m;
    };
    this.hoverLine = new LineSegments2(new LineSegmentsGeometry(), lm("#ffffff", 1.6, 0.95));
    this.hoverLine.renderOrder = 30;
    this.hoverLine.frustumCulled = false;
    this.selectLine = new LineSegments2(new LineSegmentsGeometry(), lm(this.accent, 2.6, 1));
    this.selectLine.renderOrder = 31;
    this.selectLine.frustumCulled = false;
    this.scene.add(this.hoverLine, this.selectLine);
    this.hoverFill = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    this.hoverFill.renderOrder = 28;
    this.selectFill = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(this.accent), transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    this.selectFill.renderOrder = 29;
    this.hoverFill.frustumCulled = this.selectFill.frustumCulled = false;
    this.scene.add(this.hoverFill, this.selectFill);

    this.loader.onChange = () => this.emitLoading();

    if (this.interactive) this.attachInput();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.applyLayerVisibility();

    this.loadAllsky();
    if (opts.catalogUrl !== "") this.loadCatalog(opts.catalogUrl ?? "/data/sky-catalog.json");
    this.raf = requestAnimationFrame(this.frame);
  }

  /* ---------------------------------------------------------------- events */

  on<K extends keyof Events>(type: K, fn: (d: Events[K]) => void): () => void {
    const map = this.listeners as Record<string, Set<(d: unknown) => void> | undefined>;
    const set = (map[type] ??= new Set());
    set.add(fn as (d: unknown) => void);
    return () => {
      set.delete(fn as (d: unknown) => void);
    };
  }
  private emit<K extends keyof Events>(type: K, d: Events[K]) {
    (this.listeners[type] as Set<(d: Events[K]) => void> | undefined)?.forEach((fn) => fn(d));
  }
  private emitLoading() {
    this.emit("loading", {
      pending: this.loader.pending,
      loaded: this.loader.loaded,
      failed: this.loader.failed,
      bytes: this.loader.bytes,
      displayOrder: this.displayOrder,
      visibleTiles: this.visibleGrid.length,
    });
  }

  /* ---------------------------------------------------------------- public API */

  getState(): CameraState & { color: ColorMode; layers: SkyLayers; selected: TileRef | null; displayOrder: number; gridOrder: number } {
    return { ...this.state, color: this.color, layers: { ...this.layers }, selected: this.selected, displayOrder: this.displayOrder, gridOrder: this.gridOrderNow };
  }

  setCenter(ra: number, dec: number, animate = true) {
    if (animate) this.flyTo(ra, dec, this.state.fov);
    else {
      this.state.ra = ((ra % 360) + 360) % 360;
      this.state.dec = Math.max(-89.9, Math.min(89.9, dec));
      this.dirty = true;
    }
  }

  setFov(fov: number, animate = true) {
    if (animate) this.flyTo(this.state.ra, this.state.dec, fov, 600);
    else {
      this.state.fov = THREE.MathUtils.clamp(fov, MIN_FOV, MAX_FOV);
      this.dirty = true;
    }
  }

  zoomBy(factor: number) {
    this.setFov(this.state.fov * factor);
  }

  flyTo(ra: number, dec: number, fov = this.state.fov, duration = 1400) {
    const from = this.orientation(this.state.ra, this.state.dec);
    const to = this.orientation(ra, dec);
    const toDir = new THREE.Vector3(...radecToVec(ra, dec));
    this.target = { from, to, fov0: this.state.fov, fov1: THREE.MathUtils.clamp(fov, MIN_FOV, MAX_FOV), t: 0, dur: duration, toDir };
    this.velocity = { ra: 0, dec: 0 };
    this.dirty = true;
  }

  resetView() {
    this.flyTo(266.4, -29, 90, 1600);
  }

  setColor(c: ColorMode) {
    if (c.kind === "mono" && isBlankFrame(c.frame)) {
      this.emit("error", `Frame ${c.frame} is a blank dichroic channel in the SPHEREx DR1 cube.`);
    }
    this.color = c;
    if (c.kind === "mono") {
      for (const e of this.tiles.values()) this.updateMaterialMode(e.mesh);
      this.updateMaterialMode(this.allsky.mesh);
    }
    this.loadAllsky();
    this.dirty = true;
  }

  getColor() {
    return this.color;
  }

  setDisplay(p: Partial<DisplayParams>) {
    Object.assign(this.display, p);
    this.forEachSkyMesh((m) => this.applyDisplay(m));
    this.dirty = true;
  }

  setLayers(p: Partial<SkyLayers>) {
    Object.assign(this.layers, p);
    this.applyLayerVisibility();
    this.gridKey = "";
    this.dirty = true;
  }

  setStatusProvider(fn: StatusProvider) {
    this.statusProvider = fn;
    this.gridKey = "";
    this.dirty = true;
  }

  showLayer(name: keyof SkyLayers, visible: boolean) {
    this.setLayers({ [name]: visible } as Partial<SkyLayers>);
  }

  getLayers() {
    return { ...this.layers };
  }

  selectTile(order: number, ipix: number, fly = true) {
    const center = pix2ang(order, ipix);
    this.selected = { order, ipix, center };
    this.setOutline(this.selectLine, this.selectFill, order, ipix);
    if (fly) {
      const size = tileSizeDeg(order);
      this.flyTo(center.ra, center.dec, THREE.MathUtils.clamp(size * 2.4, MIN_FOV, MAX_FOV));
    }
    this.emit("select", this.selected);
    this.dirty = true;
  }

  clearSelection() {
    this.selected = null;
    this.selectLine.visible = false;
    this.selectFill.visible = false;
    this.emit("select", null);
    this.dirty = true;
  }

  getSelected() {
    return this.selected;
  }

  screenToRadec(x: number, y: number): RaDec {
    const r = this.container.getBoundingClientRect();
    const ndc = new THREE.Vector3(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1, 0.5);
    ndc.unproject(this.camera).normalize();
    return vecToRadec(ndc.x, ndc.y, ndc.z);
  }

  get gridOrder() {
    return this.gridOrderNow;
  }

  tileUrl(order: number, ipix: number, frame: number) {
    return tileUrl(order, ipix, frame, this.hipsBase);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.loader.dispose();
    this.detachInput?.();
    for (const e of this.tiles.values()) this.disposeEntry(e);
    this.tiles.clear();
    this.disposeMesh(this.allsky.mesh);
    this.disposeMesh(this.allsky.incoming);
    this.allsky.geometry.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.overlay.remove();
    this.listeners = {};
  }

  /* ---------------------------------------------------------------- camera */

  private orientation(ra: number, dec: number): THREE.Quaternion {
    const d = Math.max(-89.95, Math.min(89.95, dec));
    const dir = new THREE.Vector3(...radecToVec(ra, d));
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), dir, new THREE.Vector3(0, 1, 0));
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }

  private updateCamera() {
    this.state.dec = Math.max(-89.9, Math.min(89.9, this.state.dec));
    this.state.ra = ((this.state.ra % 360) + 360) % 360;
    this.camera.quaternion.copy(this.orientation(this.state.ra, this.state.dec));
    this.camera.fov = this.state.fov;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    const dpr = this.renderer.getPixelRatio();
    this.overlay.width = Math.round(w * dpr);
    this.overlay.height = Math.round(h * dpr);
    this.camera.aspect = w / h;
    (this.hoverLine.material as LineMaterial).resolution.set(w, h);
    (this.selectLine.material as LineMaterial).resolution.set(w, h);
    this.dirty = true;
    this.gridKey = "";
  }

  /* ---------------------------------------------------------------- input */

  private detachInput?: () => void;

  private attachInput() {
    const el = this.renderer.domElement;
    const degPerPx = () => this.state.fov / Math.max(1, this.container.clientHeight);

    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.target = null;
      this.velocity = { ra: 0, dec: 0 };
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.drag = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, moved: 99, t: performance.now(), pinch: Math.hypot(a.x - b.x, a.y - b.y), fov: this.state.fov };
      } else {
        this.drag = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
      }
    };
    const move = (e: PointerEvent) => {
      this.lastPointer = { x: e.clientX, y: e.clientY };
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.drag && this.pointers.size === 2 && this.drag.pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.state.fov = THREE.MathUtils.clamp((this.drag.fov! * this.drag.pinch) / Math.max(1, d), MIN_FOV, MAX_FOV);
        this.dirty = true;
        return;
      }
      if (this.drag && this.pointers.size === 1) {
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        const k = degPerPx();
        const cosd = Math.max(0.05, Math.cos(this.state.dec * DEG));
        const dra = (dx * k) / cosd;
        const ddec = dy * k;
        this.state.ra += dra;
        this.state.dec += ddec;
        const now = performance.now();
        const dt = Math.max(1, now - this.drag.t);
        this.velocity = { ra: (dra / dt) * 16, dec: (ddec / dt) * 16 };
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        this.drag.t = now;
        this.dirty = true;
        this.setHover(null);
      } else {
        this.pickHover(e.clientX, e.clientY);
      }
    };
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.drag && this.pointers.size === 0) {
        if (this.drag.moved < 5) {
          this.velocity = { ra: 0, dec: 0 };
          const p = this.screenToRadec(e.clientX, e.clientY);
          const ipix = ang2pix(this.gridOrderNow, p.ra, p.dec);
          if (this.selected && this.selected.order === this.gridOrderNow && this.selected.ipix === ipix) {
            // second click on the same tile keeps the selection
          } else {
            this.selectTile(this.gridOrderNow, ipix, true);
          }
        }
        if (performance.now() - this.drag.t > 80) this.velocity = { ra: 0, dec: 0 };
        this.drag = null;
      }
      if (this.pointers.size < 2 && this.drag?.pinch) this.drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.target = null;
      const before = this.screenToRadec(e.clientX, e.clientY);
      const f = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      const old = this.state.fov;
      this.state.fov = THREE.MathUtils.clamp(old * f, MIN_FOV, MAX_FOV);
      this.updateCamera();
      // keep the sky point under the cursor fixed while zooming
      const after = this.screenToRadec(e.clientX, e.clientY);
      let dra = before.ra - after.ra;
      if (dra > 180) dra -= 360;
      if (dra < -180) dra += 360;
      this.state.ra += dra;
      this.state.dec += before.dec - after.dec;
      this.dirty = true;
    };
    const dbl = (e: MouseEvent) => {
      const p = this.screenToRadec(e.clientX, e.clientY);
      this.flyTo(p.ra, p.dec, this.state.fov * 0.45, 900);
      this.emit("dblclick", p);
    };
    const leave = () => {
      this.lastPointer = null;
      this.setHover(null);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("dblclick", dbl);
    this.detachInput = () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("dblclick", dbl);
    };
  }

  private pickHover(x: number, y: number) {
    const p = this.screenToRadec(x, y);
    const ipix = ang2pix(this.gridOrderNow, p.ra, p.dec);
    const r = this.container.getBoundingClientRect();
    if (!this.hovered || this.hovered.ipix !== ipix || this.hovered.order !== this.gridOrderNow) {
      this.hovered = { order: this.gridOrderNow, ipix, center: pix2ang(this.gridOrderNow, ipix) };
      this.setOutline(this.hoverLine, this.hoverFill, this.gridOrderNow, ipix);
      this.dirty = true;
    }
    this.emit("hover", { ...this.hovered, pointer: p, x: x - r.left, y: y - r.top });
  }

  private setHover(v: null) {
    if (this.hovered) {
      this.hovered = v;
      this.hoverLine.visible = false;
      this.hoverFill.visible = false;
      this.emit("hover", null);
      this.dirty = true;
    }
  }

  private setOutline(line: LineSegments2, fill: THREE.Mesh, order: number, ipix: number) {
    const pts = tileOutline(order, ipix, RADIUS * 0.999);
    const seg: number[] = [];
    for (let i = 0; i < pts.length / 3 - 1; i++) seg.push(...pts.slice(i * 3, i * 3 + 6));
    (line.geometry as LineSegmentsGeometry).dispose();
    const g = new LineSegmentsGeometry();
    g.setPositions(seg);
    line.geometry = g;
    line.visible = true;
    fill.geometry.dispose();
    fill.geometry = buildTileGeometry(order, ipix, RADIUS * 0.999, 8);
    fill.visible = true;
  }

  /* ---------------------------------------------------------------- imagery */

  private forEachSkyMesh(fn: (m: THREE.Mesh) => void) {
    for (const e of this.tiles.values()) {
      if (e.mesh) fn(e.mesh);
      if (e.incoming) fn(e.incoming);
    }
    if (this.allsky.mesh) fn(this.allsky.mesh);
    if (this.allsky.incoming) fn(this.allsky.incoming);
  }

  private applyDisplay(m: THREE.Mesh) {
    const u = (m.material as THREE.ShaderMaterial).uniforms;
    u.uGain.value = this.display.gain;
    u.uBias.value = this.display.bias;
    u.uGamma.value = this.display.gamma;
    u.uSat.value = this.display.saturation;
  }

  private updateMaterialMode(m: THREE.Mesh | null) {
    if (!m) return;
    const u = (m.material as THREE.ShaderMaterial).uniforms;
    if (this.color.kind === "mono") u.uCmap.value = COLORMAPS.indexOf(this.color.cmap);
  }

  private makeSkyMesh(geometry: THREE.BufferGeometry, tex: THREE.Texture[], renderOrder: number) {
    const mat = createSkyMaterial();
    mat.uniforms.tR.value = tex[0];
    mat.uniforms.tG.value = tex[1];
    mat.uniforms.tB.value = tex[2];
    mat.uniforms.uMode.value = this.color.kind === "rgb" ? 1 : 0;
    mat.uniforms.uCmap.value = this.color.kind === "mono" ? COLORMAPS.indexOf(this.color.cmap) : 0;
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = false;
    mesh.userData.textures = tex;
    this.applyDisplay(mesh);
    return mesh;
  }

  private async loadFrames(urls: string[], priority: number): Promise<THREE.Texture[] | null> {
    const unique = [...new Set(urls)];
    const bmps = await Promise.all(unique.map((u) => this.loader.load(u, priority)));
    if (bmps.some((b) => b === null)) return null;
    const texByUrl = new Map(unique.map((u, i) => [u, bitmapTexture(bmps[i]!)]));
    return urls.map((u) => texByUrl.get(u)!);
  }

  private async loadAllsky() {
    const fs = frameSet(this.color);
    if (this.allsky.setKey === fs.key || this.allsky.loadingKey === fs.key) return;
    this.allsky.loadingKey = fs.key;
    try {
      const tex = await this.loadFrames(fs.frames.map((f) => allskyUrl(f, this.hipsBase)), -1);
      if (this.disposed || this.allsky.loadingKey !== fs.key || !tex) return;
      tex.forEach((t) => {
        t.generateMipmaps = false;
        t.minFilter = THREE.LinearFilter;
      });
      const mesh = this.makeSkyMesh(this.allsky.geometry, tex, 1);
      if (this.allsky.incoming) {
        this.disposeMesh(this.allsky.mesh, true);
        this.allsky.mesh = this.allsky.incoming;
      }
      this.allsky.incoming = mesh;
      this.allsky.fade = 0;
      (mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0;
      mesh.visible = this.layers.imagery;
      this.scene.add(mesh);
      this.allsky.loadingKey = null;
      this.allsky.setKey = fs.key;
      if (!this.readyEmitted) {
        this.readyEmitted = true;
        this.emit("ready", undefined);
      }
      this.dirty = true;
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        this.allsky.loadingKey = null;
        this.emit("error", `All-sky preview failed to load: ${(e as Error).message}`);
      }
    }
  }
  private readyEmitted = false;

  private disposeMesh(m: THREE.Mesh | null, keepGeometry = true) {
    if (!m) return;
    this.scene.remove(m);
    (m.userData.textures as THREE.Texture[] | undefined)?.forEach((t) => {
      (t.image as ImageBitmap | undefined)?.close?.();
      t.dispose();
    });
    (m.material as THREE.Material).dispose();
    if (!keepGeometry) m.geometry.dispose();
  }

  private disposeEntry(e: TileEntry) {
    this.disposeMesh(e.mesh);
    this.disposeMesh(e.incoming);
    e.geometry.dispose();
  }

  private chooseDisplayOrder(): number {
    const h = this.container.clientHeight * this.renderer.getPixelRatio();
    const degPerPx = this.state.fov / Math.max(1, h);
    let k = 0;
    for (let o = 1; o <= HIPS.maxOrder; o++) {
      const pix = HIPS.pixelScaleDeg * 2 ** (HIPS.maxOrder - o);
      k = o;
      if (pix <= degPerPx * 1.6) break;
    }
    // Order 0/1 tiles are no sharper than the order-3 Allsky (6.9′ ≈ order-0 512px pixels);
    // only stream tiles when they add real detail.
    const allskyPix = HIPS.pixelScaleDeg * 2 ** HIPS.maxOrder;
    if (allskyPix <= degPerPx * 1.6) return 0;
    return k;
  }

  private viewCone(scale = 1): { dir: THREE.Vector3; half: number } {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const vf = (this.state.fov * DEG) / 2;
    const half = Math.atan(Math.tan(Math.min(vf, 1.5)) * Math.sqrt(1 + this.camera.aspect ** 2));
    return { dir, half: Math.min(Math.PI, half * scale) };
  }

  private updateTiles() {
    const order = this.layers.imagery ? this.chooseDisplayOrder() : 0;
    this.displayOrder = order;
    const fs = frameSet(this.color);
    const wantedUrls = new Map<string, number>();
    const now = this.frameCounter;
    const visibleKeys = new Set<string>();

    if (order >= 1) {
      const { dir, half } = this.viewCone();
      // predicted direction: shift prefetch cone with current velocity
      const predicted = new THREE.Vector3(...radecToVec(this.state.ra + this.velocity.ra * 20, this.state.dec + this.velocity.dec * 20));
      const visible = tilesInCone(order, dir, half, 600);
      const ring = tilesInCone(order, predicted, half * 1.35, 900);
      const all = [...new Set([...visible, ...ring])];
      for (const ipix of all) {
        const isVisible = visible.includes(ipix);
        const key = `${order}/${ipix}`;
        let e = this.tiles.get(key);
        if (!e) {
          e = { key, order, ipix, geometry: buildTileGeometry(order, ipix, RADIUS), mesh: null, incoming: null, setKey: null, loadingKey: null, lastUsed: now, empty: false, fade: 1 };
          this.tiles.set(key, e);
        }
        e.lastUsed = now;
        if (isVisible) visibleKeys.add(key);
        const b = pix2ang(order, ipix);
        const dist = new THREE.Vector3(...radecToVec(b.ra, b.dec)).angleTo(dir);
        const priority = (isVisible ? 0 : 10) + dist;
        if (!e.empty && e.setKey !== fs.key) {
          fs.frames.forEach((f) => wantedUrls.set(tileUrl(order, ipix, f, this.hipsBase), priority));
          if (e.loadingKey !== fs.key) this.loadTile(e, fs, priority);
        }
      }
      // Keep visible lower-order tiles (already loaded) as a fallback underneath
      for (const e of this.tiles.values()) {
        if (e.order < order && e.mesh) {
          const { dir: d2, half: h2 } = this.viewCone();
          const b = pix2ang(e.order, e.ipix);
          if (new THREE.Vector3(...radecToVec(b.ra, b.dec)).angleTo(d2) < h2 + tileSizeDeg(e.order) * DEG) {
            visibleKeys.add(e.key);
            e.lastUsed = now;
          }
        }
      }
    }
    // Allsky frames must stay wanted
    fs.frames.forEach((f) => wantedUrls.set(allskyUrl(f, this.hipsBase), -1));
    this.loader.retain(wantedUrls);

    for (const e of this.tiles.values()) {
      const vis = visibleKeys.has(e.key) && this.layers.imagery;
      if (e.mesh) e.mesh.visible = vis;
      if (e.incoming) e.incoming.visible = vis;
      if (!wantedUrls.size || e.loadingKey) {
        // loadingKey reset happens on cancellation in loadTile
      }
    }
    this.evict(visibleKeys);
  }

  private async loadTile(e: TileEntry, fs: FrameSet, priority: number) {
    e.loadingKey = fs.key;
    try {
      const tex = await this.loadFrames(fs.frames.map((f) => tileUrl(e.order, e.ipix, f, this.hipsBase)), priority);
      if (this.disposed || !this.tiles.has(e.key) || e.loadingKey !== fs.key) {
        tex?.forEach((t) => t.dispose());
        return;
      }
      e.loadingKey = null;
      if (!tex) {
        e.empty = true;
        return;
      }
      const mesh = this.makeSkyMesh(e.geometry, tex, 2 + e.order);
      (mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0;
      if (e.incoming) {
        this.disposeMesh(e.mesh);
        e.mesh = e.incoming;
        (e.mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 1;
      }
      e.incoming = mesh;
      e.fade = 0;
      e.setKey = fs.key;
      this.scene.add(mesh);
      this.dirty = true;
    } catch (err) {
      if (e.loadingKey === fs.key) e.loadingKey = null;
      if ((err as Error)?.name !== "AbortError") {
        this.emit("error", `Tile ${e.key} failed: ${(err as Error).message}`);
      }
    }
  }

  private evict(visible: Set<string>) {
    if (this.tiles.size <= MAX_TILE_ENTRIES) return;
    const sorted = [...this.tiles.values()].filter((e) => !visible.has(e.key)).sort((a, b) => a.lastUsed - b.lastUsed);
    let excess = this.tiles.size - MAX_TILE_ENTRIES;
    for (const e of sorted) {
      if (excess-- <= 0) break;
      this.disposeEntry(e);
      this.tiles.delete(e.key);
    }
  }

  private stepFades(dt: number): boolean {
    let animating = false;
    const step = dt / 450;
    const advance = (holder: { mesh: THREE.Mesh | null; incoming: THREE.Mesh | null; fade: number }, keepGeo: boolean) => {
      if (!holder.incoming) return;
      holder.fade = Math.min(1, holder.fade + step);
      const eased = holder.fade * holder.fade * (3 - 2 * holder.fade);
      (holder.incoming.material as THREE.ShaderMaterial).uniforms.uOpacity.value = eased;
      animating = true;
      if (holder.fade >= 1) {
        this.disposeMesh(holder.mesh, keepGeo);
        holder.mesh = holder.incoming;
        holder.incoming = null;
      }
    };
    advance(this.allsky, true);
    for (const e of this.tiles.values()) advance(e, true);
    return animating;
  }

  /* ---------------------------------------------------------------- overlays */

  private applyLayerVisibility() {
    const L = this.layers;
    if (this.allsky.mesh) this.allsky.mesh.visible = L.imagery;
    if (this.allsky.incoming) this.allsky.incoming.visible = L.imagery;
    this.gridLines.visible = L.grid;
    this.statusMesh.visible = !!L.status;
    this.eqGrid.visible = L.eqGrid;
    this.consLines.visible = L.constellations;
    this.eclipticLine.visible = L.ecliptic;
    this.galacticLine.visible = L.galactic;
    if (this.starPoints) this.starPoints.visible = L.stars;
  }

  private makeCurve(fn: (t: number) => RaDec, color: number, opacity: number) {
    const pts: number[] = [];
    for (let i = 0; i <= 720; i++) {
      const p = fn(i / 720);
      const v = radecToVec(p.ra, p.dec);
      pts.push(v[0] * 0.998, v[1] * 0.998, v[2] * 0.998);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.01, gapSize: 0.006, depthTest: false }));
    line.computeLineDistances();
    line.renderOrder = 19;
    line.frustumCulled = false;
    this.scene.add(line);
    return line;
  }

  private async loadCatalog(url: string) {
    try {
      const res = await fetch(url);
      const cat = (await res.json()) as SkyCatalog;
      if (this.disposed) return;
      this.catalog = cat;
      // constellation lines: great-circle interpolated segments
      const seg: number[] = [];
      for (const line of cat.lines) {
        for (let i = 0; i < line.length - 1; i++) {
          const a = new THREE.Vector3(...radecToVec(line[i][0], line[i][1]));
          const b = new THREE.Vector3(...radecToVec(line[i + 1][0], line[i + 1][1]));
          const steps = Math.max(1, Math.ceil(a.angleTo(b) / (2 * DEG)));
          let prev = a.clone();
          for (let s = 1; s <= steps; s++) {
            const p = a.clone().lerp(b, s / steps).normalize();
            seg.push(prev.x * 0.997, prev.y * 0.997, prev.z * 0.997, p.x * 0.997, p.y * 0.997, p.z * 0.997);
            prev = p;
          }
        }
      }
      this.consLines.geometry.dispose();
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
      this.consLines.geometry = g;
      this.buildStars(cat);
      this.dirty = true;
    } catch (e) {
      this.emit("error", `Catalogue overlay unavailable: ${(e as Error).message}`);
    }
  }

  /** Catalogue positions drawn as thin rings so they never masquerade as SPHEREx pixels. */
  private buildStars(cat: SkyCatalog) {
    const bright = cat.stars.filter((s) => s[2] < 4.2);
    const pos = new Float32Array(bright.length * 3);
    const size = new Float32Array(bright.length);
    bright.forEach((s, i) => {
      const v = radecToVec(s[0], s[1]);
      pos.set([v[0] * 0.996, v[1] * 0.996, v[2] * 0.996], i * 3);
      size[i] = Math.max(5, (4.6 - s[2]) * 4.2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("size", new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1 }, uColor: { value: new THREE.Color(0xbcd4ff) } },
      vertexShader: `attribute float size; uniform float uScale; void main(){ gl_PointSize = size * uScale; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform vec3 uColor; void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c); float ring = smoothstep(0.5,0.42,r) * smoothstep(0.30,0.38,r); if (ring < 0.01) discard; gl_FragColor = vec4(uColor, ring*0.55); }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.starPoints = new THREE.Points(g, mat);
    this.starPoints.renderOrder = 24;
    this.starPoints.frustumCulled = false;
    this.starPoints.visible = this.layers.stars;
    this.scene.add(this.starPoints);
  }

  private autoGridOrder(): number {
    if (this.layers.gridOrder !== "auto") return this.layers.gridOrder;
    // aim for tiles ≈ 1/5 of the vertical field
    const want = this.state.fov / 5;
    let k = 0;
    for (let o = 0; o <= HIPS.maxOrder; o++) {
      if (tileSizeDeg(o) >= want) k = o;
    }
    return k;
  }

  private updateGrid() {
    const order = this.autoGridOrder();
    this.gridOrderNow = order;
    const { dir, half } = this.viewCone(1.05);
    const key = `${order}|${this.layers.status}|${Math.round(dir.x * 200)},${Math.round(dir.y * 200)},${Math.round(dir.z * 200)}|${half.toFixed(2)}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    const tiles = order <= 1 ? Array.from({ length: 12 * 4 ** order }, (_, i) => i) : tilesInCone(order, dir, half, 3000);
    this.visibleGrid = tiles;
    if (this.layers.grid) {
      const pos = tileBoundarySegments(order, tiles, RADIUS * 0.998);
      this.gridLines.geometry.dispose();
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.gridLines.geometry = g;
      (this.gridLines.material as THREE.LineBasicMaterial).opacity = order >= 4 ? 0.22 : 0.16;
    }
    if (this.layers.status && this.statusProvider) this.buildStatus(order, tiles);
    if (this.hovered && this.hovered.order !== order) this.setHover(null);
  }

  private buildStatus(order: number, tiles: number[]) {
    const parts: { g: THREE.BufferGeometry; c: [number, number, number, number] }[] = [];
    for (const n of tiles) {
      const c = this.statusProvider!(this.layers.status!, order, n);
      if (c) parts.push({ g: buildTileGeometry(order, n, RADIUS * 0.998, 4), c });
    }
    let nv = 0;
    let ni = 0;
    parts.forEach((p) => {
      nv += p.g.getAttribute("position").count;
      ni += p.g.getIndex()!.count;
    });
    const pos = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 4);
    const idx = new Uint32Array(ni);
    let ov = 0;
    let oi = 0;
    for (const p of parts) {
      const pa = p.g.getAttribute("position").array as Float32Array;
      const ia = p.g.getIndex()!.array;
      pos.set(pa, ov * 3);
      for (let i = 0; i < pa.length / 3; i++) col.set(p.c, (ov + i) * 4);
      for (let k = 0; k < ia.length; k++) idx[oi + k] = ia[k] + ov;
      ov += pa.length / 3;
      oi += ia.length;
      p.g.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.statusMesh.geometry.dispose();
    this.statusMesh.geometry = g;
  }

  private eqStep(): [number, number] {
    const f = this.state.fov;
    if (f > 60) return [15, 10];
    if (f > 25) return [7.5, 5];
    if (f > 10) return [3.75, 2];
    if (f > 4) return [1.25, 1];
    return [0.5, 0.25];
  }

  private updateEqGrid() {
    if (!this.layers.eqGrid) return;
    const [sra, sdec] = this.eqStep();
    const key = `${sra}`;
    if (key === this.eqKey) return;
    this.eqKey = key;
    const seg: number[] = [];
    const push = (a: RaDec, b: RaDec) => {
      const va = radecToVec(a.ra, a.dec);
      const vb = radecToVec(b.ra, b.dec);
      seg.push(va[0] * 0.997, va[1] * 0.997, va[2] * 0.997, vb[0] * 0.997, vb[1] * 0.997, vb[2] * 0.997);
    };
    const dd = Math.min(1, sdec / 2);
    for (let ra = 0; ra < 360; ra += sra) {
      for (let dec = -88; dec < 88; dec += dd) push({ ra, dec }, { ra, dec: Math.min(88, dec + dd) });
    }
    for (let dec = -90 + sdec; dec < 90; dec += sdec) {
      const dr = Math.min(1, sra / 4);
      for (let ra = 0; ra < 360; ra += dr) push({ ra, dec }, { ra: ra + dr, dec });
    }
    this.eqGrid.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    this.eqGrid.geometry = g;
  }

  /* ---------------------------------------------------------------- 2D labels */

  private project(ra: number, dec: number, out: { x: number; y: number }): boolean {
    const v = radecToVec(ra, dec);
    this.tmpV.set(v[0], v[1], v[2]);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    if (this.tmpV.dot(fwd) < 0.05) return false;
    this.tmpV.project(this.camera);
    const w = this.overlay.width;
    const h = this.overlay.height;
    out.x = (this.tmpV.x * 0.5 + 0.5) * w;
    out.y = (-this.tmpV.y * 0.5 + 0.5) * h;
    return out.x > -200 && out.x < w + 200 && out.y > -60 && out.y < h + 60;
  }

  private drawLabels() {
    const ctx = this.ctx2d;
    const w = this.overlay.width;
    const h = this.overlay.height;
    const dpr = this.renderer.getPixelRatio();
    ctx.clearRect(0, 0, w, h);
    const p = { x: 0, y: 0 };
    const font = (px: number, weight = 500) => `${weight} ${px * dpr}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textBaseline = "middle";

    // equatorial grid labels along the central meridian / parallel
    if (this.layers.eqGrid) {
      const [sra, sdec] = this.eqStep();
      ctx.font = font(10.5);
      ctx.fillStyle = "rgba(140,175,230,0.75)";
      ctx.textAlign = "left";
      for (let dec = -90 + sdec; dec < 90; dec += sdec) {
        if (this.project(this.state.ra, dec, p)) {
          const label = `${dec > 0 ? "+" : dec < 0 ? "−" : ""}${Math.abs(dec) % 1 === 0 ? Math.abs(dec).toFixed(0) : Math.abs(dec).toFixed(2)}°`;
          ctx.fillText(label, p.x + 6 * dpr, p.y - 7 * dpr);
        }
      }
      ctx.textAlign = "center";
      const dec0 = Math.max(-80, Math.min(80, this.state.dec));
      for (let ra = 0; ra < 360; ra += sra) {
        if (this.project(ra, dec0, p)) {
          ctx.fillText(sra >= 7.5 || ra % 15 === 0 ? `${Math.round(ra / 15)}h` : formatRA(ra), p.x, p.y + 10 * dpr);
        }
      }
    }

    if (this.catalog) {
      // constellation names
      if (this.layers.constellationNames) {
        ctx.font = font(this.state.fov > 70 ? 11 : 12.5, 500);
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(130,175,240,0.78)";
        const maxRank = this.state.fov > 90 ? 2 : 3;
        for (const c of this.catalog.constellations) {
          if (c.rank > maxRank) continue;
          if (this.project(c.ra, c.dec, p)) {
            ctx.save();
            ctx.letterSpacing = `${1.5 * dpr}px`;
            ctx.fillText(c.name, p.x, p.y);
            ctx.restore();
          }
        }
      }
      // star names
      if (this.layers.starNames) {
        const magLimit = this.state.fov > 80 ? 1.6 : this.state.fov > 40 ? 2.4 : this.state.fov > 15 ? 3.2 : 4.2;
        ctx.font = font(11.5, 500);
        ctx.textAlign = "left";
        for (const s of this.catalog.stars) {
          if (!s[4] || s[2] > magLimit) continue;
          if (this.project(s[0], s[1], p)) {
            ctx.fillStyle = "rgba(235,240,255,0.9)";
            ctx.shadowColor = "rgba(0,0,0,0.9)";
            ctx.shadowBlur = 4 * dpr;
            ctx.fillText(s[4], p.x + 9 * dpr, p.y - 7 * dpr);
            ctx.shadowBlur = 0;
          }
        }
      }
    }

    if (this.layers.ecliptic) this.curveLabel("Ecliptic", (t) => eclipticToRadec(t * 360), "rgba(232,184,106,0.8)");
    if (this.layers.galactic) this.curveLabel("Galactic equator", (t) => galacticToRadec(t * 360, 0), "rgba(216,138,216,0.8)");

    // tile ID labels
    if (this.layers.grid && this.layers.tileLabels && this.visibleGrid.length < 260) {
      ctx.font = font(10, 500);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (const n of this.visibleGrid) {
        const c = pix2ang(this.gridOrderNow, n);
        if (this.project(c.ra, c.dec, p)) ctx.fillText(String(n), p.x, p.y);
      }
    }
  }

  private curveLabel(text: string, fn: (t: number) => RaDec, color: string) {
    const p = { x: 0, y: 0 };
    const w = this.overlay.width;
    const h = this.overlay.height;
    let best: { x: number; y: number; d: number } | null = null;
    for (let i = 0; i < 360; i++) {
      const r = fn(i / 360);
      if (this.project(r.ra, r.dec, p)) {
        const d = Math.hypot(p.x - w * 0.62, p.y - h * 0.5);
        if (p.x > 0 && p.x < w && p.y > 0 && p.y < h && (!best || d < best.d)) best = { x: p.x, y: p.y, d };
      }
    }
    if (best) {
      const dpr = this.renderer.getPixelRatio();
      this.ctx2d.font = `500 ${11 * dpr}px ui-sans-serif, system-ui, sans-serif`;
      this.ctx2d.fillStyle = color;
      this.ctx2d.textAlign = "left";
      this.ctx2d.fillText(text, best.x + 6 * dpr, best.y - 8 * dpr);
    }
  }

  /* ---------------------------------------------------------------- loop */

  private wasMoving = false;

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const rawDt = now - this.lastFrame;
    const dt = Math.min(64, rawDt);
    this.lastFrame = now;
    this.frameCounter++;

    let moving = false;
    if (this.target) {
      const t = this.target;
      // wall-clock progress so flights finish on time even at low frame rates
      t.t = Math.min(1, t.t + Math.min(rawDt, 1000) / t.dur);
      const e = t.t < 0.5 ? 4 * t.t ** 3 : 1 - (-2 * t.t + 2) ** 3 / 2;
      const q = t.from.clone().slerp(t.to, e);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      const rd = vecToRadec(dir.x, dir.y, dir.z);
      this.state.ra = rd.ra;
      this.state.dec = rd.dec;
      // log-space fov interpolation feels natural for zoom
      this.state.fov = Math.exp(Math.log(t.fov0) + (Math.log(t.fov1) - Math.log(t.fov0)) * e);
      if (t.t >= 1) {
        const f = vecToRadec(t.toDir.x, t.toDir.y, t.toDir.z);
        this.state.ra = f.ra;
        this.state.dec = f.dec;
        this.target = null;
      }
      moving = true;
    } else if (!this.drag && (Math.abs(this.velocity.ra) > 1e-4 || Math.abs(this.velocity.dec) > 1e-4)) {
      const k = dt / 16;
      this.state.ra += this.velocity.ra * k;
      this.state.dec += this.velocity.dec * k;
      const decay = Math.pow(0.92, k);
      this.velocity.ra *= decay;
      this.velocity.dec *= decay;
      moving = true;
    }
    if (moving) this.dirty = true;
    // one settling frame after motion stops so LOD/grid catch up with the final view
    if (!moving && this.wasMoving) this.dirty = true;
    this.wasMoving = moving;

    const fading = this.stepFades(dt);
    if (!this.dirty && !fading) return;

    this.updateCamera();
    if (this.frameCounter % 6 === 0 || !moving) {
      this.updateTiles();
      this.updateGrid();
      this.updateEqGrid();
    }
    if (this.starPoints) (this.starPoints.material as THREE.ShaderMaterial).uniforms.uScale.value = this.renderer.getPixelRatio() * THREE.MathUtils.clamp(60 / this.state.fov, 0.7, 1.6);
    this.renderer.render(this.scene, this.camera);
    this.drawLabels();

    // fps
    this.fpsAcc.n++;
    this.fpsAcc.t += dt;
    if (this.fpsAcc.t > 500) {
      this.emit("fps", Math.round((this.fpsAcc.n * 1000) / this.fpsAcc.t));
      this.fpsAcc = { n: 0, t: 0 };
    }
    if (this.dirty) {
      const h = this.container.clientHeight * this.renderer.getPixelRatio();
      const maxRes = this.state.fov / Math.max(1, h) < HIPS.pixelScaleDeg;
      this.emit("camera", { ...this.state, displayOrder: this.displayOrder, gridOrder: this.gridOrderNow, maxRes });
    }
    if (this.lastPointer && moving) this.pickHover(this.lastPointer.x, this.lastPointer.y);
    this.dirty = false;
  }
}

export { boundary, HIPS };

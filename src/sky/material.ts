import * as THREE from "three";

export type Colormap = "gray" | "inferno" | "ice" | "viridis";
export const COLORMAPS: Colormap[] = ["gray", "inferno", "ice", "viridis"];

export interface DisplayParams {
  gain: number;
  bias: number;
  gamma: number;
  saturation: number;
}

export const DEFAULT_DISPLAY: DisplayParams = { gain: 0.92, bias: -0.045, gamma: 1.22, saturation: 1.25 };

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tR;
uniform sampler2D tG;
uniform sampler2D tB;
uniform int uMode;      // 0 mono, 1 rgb
uniform int uCmap;      // 0 gray, 1 inferno, 2 ice, 3 viridis
uniform float uGain;
uniform float uBias;
uniform float uGamma;
uniform float uSat;
uniform float uOpacity;

vec3 inferno(float t) {
  const vec3 c0 = vec3(0.0002189403691192265, 0.001651004631001012, -0.01948089843709184);
  const vec3 c1 = vec3(0.1065134194856116, 0.5639564367884091, 3.932712388889277);
  const vec3 c2 = vec3(11.60249308247187, -3.972853965665698, -15.9423941062914);
  const vec3 c3 = vec3(-41.70399613139459, 17.43639888205313, 44.35414519872813);
  const vec3 c4 = vec3(77.162935699427, -33.40235894210092, -81.80730925738993);
  const vec3 c5 = vec3(-71.31942824499214, 32.62606426397723, 73.20951985803202);
  const vec3 c6 = vec3(25.13112622477341, -12.24266895238567, -23.07032500287172);
  return c0+t*(c1+t*(c2+t*(c3+t*(c4+t*(c5+t*c6)))));
}
vec3 viridis(float t) {
  const vec3 c0 = vec3(0.2777273272234177, 0.005407344544966578, 0.3340998053353061);
  const vec3 c1 = vec3(0.1050930431085774, 1.404613529898575, 1.384590162594685);
  const vec3 c2 = vec3(-0.3308618287255563, 0.214847559468213, 0.09509516302823659);
  const vec3 c3 = vec3(-4.634230498983486, -5.799100973351585, -19.33244095627987);
  const vec3 c4 = vec3(6.228269936347081, 14.17993336680509, 56.69055260068105);
  const vec3 c5 = vec3(4.776384997670288, -13.74514537774601, -65.35303263337234);
  const vec3 c6 = vec3(-5.435455855934631, 4.645852612178535, 26.3124352495832);
  return c0+t*(c1+t*(c2+t*(c3+t*(c4+t*(c5+t*c6)))));
}
vec3 ice(float t) {
  return clamp(vec3(t*t*1.1, t*0.95 + 0.02, 0.18 + t*1.05), 0.0, 1.0);
}
void main() {
  float r = texture2D(tR, vUv).r;
  vec3 c;
  if (uMode == 1) {
    c = vec3(r, texture2D(tG, vUv).r, texture2D(tB, vUv).r);
    c = clamp(c * uGain + uBias, 0.0, 1.0);
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(l), c, uSat);
  } else {
    float v = clamp(r * uGain + uBias, 0.0, 1.0);
    if (uCmap == 1) c = inferno(v);
    else if (uCmap == 2) c = ice(v);
    else if (uCmap == 3) c = viridis(v);
    else c = vec3(v);
  }
  c = pow(clamp(c, 0.0, 1.0), vec3(uGamma));
  gl_FragColor = vec4(c, uOpacity);
}`;

const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
blank.needsUpdate = true;

export function createSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      tR: { value: blank },
      tG: { value: blank },
      tB: { value: blank },
      uMode: { value: 1 },
      uCmap: { value: 0 },
      uGain: { value: DEFAULT_DISPLAY.gain },
      uBias: { value: DEFAULT_DISPLAY.bias },
      uGamma: { value: DEFAULT_DISPLAY.gamma },
      uSat: { value: DEFAULT_DISPLAY.saturation },
      uOpacity: { value: 1 },
    },
    side: THREE.DoubleSide,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

export function bitmapTexture(bmp: ImageBitmap): THREE.Texture {
  const t = new THREE.Texture(bmp);
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

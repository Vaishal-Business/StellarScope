# StellarScope

Created by **Vaishal Anil** and **Parthiv** — [Team The Abyss](https://www.spaceappschallenge.org/2026/find-a-team/the-abyss/), NASA Space Apps Challenge 2026.

Citizen-science discovery platform on NASA SPHEREx DR1 (released 12 Nov 2026).
Next.js 16 · React 19 · Three.js · Neon Postgres · onnxruntime-web · Tailwind 4 · shadcn + Aceternity · Astryx (neutral, dark).

```bash
npm install
npm run dev        # http://localhost:3000
npx vitest run     # 19 scientific/unit tests
npx next build     # production build
```

Copy `.env.example` to `.env.local` and set `DATABASE_URL` to a Neon Postgres connection string; tables are created automatically on first request and start **empty** — every post, review, submission, claim and model run shown in the app is created by real users.

## Environment (`.env.local`, server-only — never commit)

```
IFM_API_KEY=...            # MBZUAI IFM (UAE) — https://api.ifm.ai/v1, model IFM/K2-Horizon-375B-A23B
NVIDIA_API_KEY=...         # NVIDIA NIM — https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
NVIDIA_FALLBACK_MODEL=openai/gpt-oss-20b
```

Keys are read only by `src/server/llm.ts`; the browser talks to `/api/assistant`, which rate-limits per visitor (20 req/min) and alternates providers round-robin with failover on 429/5xx/timeouts.

## Real data everywhere

| Feature | Source |
| --- | --- |
| Sky imagery, 102 channels, HEALPix grid | IRSA HiPS `spherex_allsky_cube` (DR1) |
| Observation visits / epochs | IRSA SIAv2 `spherex_dr1` (+ `spherex_qr3`) |
| Science inspector, spectra | DR1 order-5 cubes via HTTP byte ranges (`/api/science/*`) |
| **Spectral Scout input** | Real L2 spectral images: TAN-SIP astrometry + WCS-WAVE lookup, 64×64 north-up cutouts at 6.15″/px read with multipart byte ranges (~60 KB per exposure), 4 epochs × up to 3 exposures/detector, MAD-normalised (`src/server/l2.ts`, `src/server/scout.ts`) |
| **Spectral Scout inference** | `public/models/spectral_scout_v2.onnx` + `model_card.json`, onnxruntime-web WASM in the browser, on demand only; thresholds read from the model card |
| AI assistant | IFM K2 Horizon + NVIDIA Nemotron with tools: CDS Sesame name resolution, IRSA SIA, tile geometry, DB stats, and UI control (fly, select tile, wavelength, layers, run model, navigate) |
| Community, missions, reviews, leaderboard, map layers, My Lab | Neon Postgres via `/api/*` (accounts with scrypt-hashed passwords, httpOnly session cookies) |

A submission becomes **verified** after two independent "verify" reviews outnumbering challenges; authors can't review their own work; challenges require a written note. XP is derived from recorded actions only.

## Intro video & settings

`public/media/intro.mp4` (H.264, transcoded from the supplied HEVC .MOV) plays on first load with Skip and mute. `/settings` toggles the intro, intro-every-visit, loading splash, floating assistant and preferred AI provider.

## Validation

`tests/healpix.test.ts`: official example (RA 60.8109955, Dec 51.3404038 → order-5 pixel 445), corners vs IRSA HpxFinder, round trips, poles, RA seam, FITS HPX WCS vs HEALPix sub-pixels (< 0.01″), search parsing.

## Known limitations

- First Spectral Scout run at a position takes ~1–2 min (two SIA queries ~20 s each + ~54 cutouts); inputs are cached in SQLite afterwards.
- Cutout resampling is bilinear and ignores per-pixel FLAGS (RICE-compressed); invalid pixels come through as NaN from IMAGE/VARIANCE.
- Spectral Scout limitations are those in its model card (synthetic-injection training; real-sky precision unmeasured).
- ESLint's React Compiler rules flag setState-in-effect patterns; type-check, tests and build are clean.

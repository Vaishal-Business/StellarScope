"use client";

import { useEffect, useState } from "react";
import { Brain, Cpu, FileJson, Gauge, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Reveal, RevealInView } from "@/components/motion/reveal";
import { TileImage } from "@/components/sky/tile-image";
import { ScoutPanel } from "@/components/scout/scout-panel";
import { Btn, Chip, KV, LiveTag, Panel, PanelHeader, SectionTitle } from "@/components/ui/kit";
import { loadCard, type ModelCard } from "@/lib/scout-client";
import { useLive, timeAgo } from "@/lib/live";
import { ang2pix, pix2ang } from "@/sky/healpix";
import { describeTile } from "@/sky/spherex";
import { formatDec, formatRA } from "@/sky/coords";
import { MISSIONS } from "@/lib/missions";
import { cn } from "@/lib/utils";

const PRESETS = [
  ...MISSIONS.filter((m) => m.target.order === 5).map((m) => ({ label: m.target.label, ra: m.target.ra, dec: m.target.dec })),
];

interface Run {
  id: number; tile_order: number; tile_ipix: number; tile5: number; ra: number; dec: number; model_version: string;
  best_channel: number | null; track_flag: number; anomaly_flag: number; incomplete: number; summary_json: string; created_at: number; who: string;
}

export function AiEngine() {
  const [target, setTarget] = useState<{ ra: number; dec: number; order: number; ipix: number }>(() => {
    const p = PRESETS[0];
    return { ra: p.ra, dec: p.dec, order: 5, ipix: ang2pix(5, p.ra, p.dec) };
  });
  const [card, setCard] = useState<ModelCard | null>(null);
  const runs = useLive<{ runs: Run[] }>("/api/scout/runs");

  useEffect(() => {
    loadCard().then(setCard).catch(() => {});
    const t = new URLSearchParams(window.location.search).get("tile");
    if (t) {
      const [o, i] = t.split("/").map(Number);
      if (Number.isInteger(o) && Number.isInteger(i) && o >= 0 && o <= 5 && i >= 0 && i < 12 * 4 ** o) {
        const c = pix2ang(o, i);
        const c5 = pix2ang(5, ang2pix(5, c.ra, c.dec));
        setTarget({ ra: c5.ra, dec: c5.dec, order: o, ipix: i });
      }
    }
  }, []);
  const info = describeTile(target.order, target.ipix);

  return (
    <AppShell>
      <div className="px-5 md:px-8">
        <Reveal delay={0.1}>
          <SectionTitle
            eyebrow="AI Research Engine · Spectral Scout v2"
            title="A custom model that reads all 102 channels"
            desc="Runs only when you ask. It builds a 4-epoch input from real SPHEREx L2 exposures at your target, then the ONNX model — in your browser — chooses the most useful channels and scores spectral anomalies, motion and artefacts."
            right={card ? <LiveTag>{card.model_version} · {card.parameters.toLocaleString()} params</LiveTag> : undefined}
          />
        </Reveal>

        <div className="mt-8 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Reveal delay={0.16} className="space-y-4">
            <Panel className="p-4">
              <PanelHeader title="Target" />
              <TileImage order={target.order} ipix={target.ipix} className="mt-3 aspect-square w-full rounded-xl border border-white/[0.07]" gain={1.25} />
              <div className="mt-3">
                <KV k="Tile" v={info.id} />
                <KV k="Position" v={`${formatRA(target.ra)} ${formatDec(target.dec)}`} />
              </div>
              <div className="eyebrow mt-4 mb-2">Mission targets</div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setTarget({ ra: p.ra, dec: p.dec, order: 5, ipix: ang2pix(5, p.ra, p.dec) })}
                    className={cn("rounded-full border px-2.5 py-1 text-[11px] transition", Math.abs(target.ra - p.ra) < 1e-3 ? "border-signal/40 bg-signal/10 text-signal" : "border-white/10 text-white/60 hover:text-white")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[10.5px] text-white/40">Or pick any tile in the sky and open its Scout tab, or ask the assistant to “run Spectral Scout on …”.</p>
            </Panel>
            {card && (
              <Panel className="p-4">
                <PanelHeader title={<span className="flex items-center gap-2"><FileJson className="size-3.5" /> Model card</span>} />
                <div className="mt-2">
                  <KV k="Track threshold" v={card.thresholds.track_prob.toFixed(4)} />
                  <KV k="Anomaly threshold" v={card.thresholds.anomaly_global.toFixed(4)} />
                  <KV k="Track AUC (synthetic)" v={card.evaluation_synthetic.track_auc.toFixed(3)} />
                  <KV k="Anomaly AUC (synthetic)" v={card.evaluation_synthetic.anom_auc.toFixed(3)} />
                  <KV k="Artefact bal. acc." v={card.evaluation_synthetic.art_bal_acc.toFixed(3)} />
                  <KV k="Motion FPR" v={card.evaluation_synthetic.fpr.toFixed(4)} />
                </div>
                <div className="eyebrow mt-3 mb-1.5">Trained around</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(card.training_data.real_fields).map(([k, v]) => (
                    <Chip key={k}>{k} · {v.role}</Chip>
                  ))}
                </div>
                <div className="eyebrow mt-3 mb-1.5">Limitations</div>
                <ul className="list-disc space-y-1 pl-4 text-[11px] text-white/55">
                  {card.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </Panel>
            )}
          </Reveal>

          <div className="space-y-4">
            <Reveal delay={0.2}>
              <Panel className="p-5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[13px] text-white">
                    <Brain className="size-4 text-signal" /> Analysis
                  </span>
                  <Chip>
                    <Cpu className="size-3" /> runs in your browser
                  </Chip>
                </div>
                <div className="mt-4">
                  <ScoutPanel key={`${target.ra}:${target.dec}`} ra={target.ra} dec={target.dec} order={target.order} ipix={target.ipix} onResult={() => runs.reload()} />
                </div>
              </Panel>
            </Reveal>
            <RevealInView>
              <Panel className="p-5">
                <PanelHeader title={<span className="flex items-center gap-2"><Gauge className="size-3.5" /> Recent runs across the platform</span>} meta={runs.data ? `${runs.data.runs.length}` : ""} />
                {runs.data && runs.data.runs.length === 0 && <p className="mt-3 text-[12px] text-white/45">No runs yet — yours will be the first.</p>}
                <div className="mt-3 space-y-1.5">
                  {runs.data?.runs.slice(0, 12).map((r) => {
                    const s = JSON.parse(r.summary_json) as { bestWavelengthUm?: number; anomalyGlobal?: number; trackProb?: number };
                    return (
                      <button key={r.id} onClick={() => setTarget({ ra: r.ra, dec: r.dec, order: r.tile_order, ipix: r.tile_ipix })} className="flex w-full items-center gap-3 rounded-xl border border-white/[0.05] px-3 py-2 text-left hover:border-white/20">
                        <span className="font-mono text-[11px] text-white">SPX-5-{r.tile5}</span>
                        <span className="font-mono text-[10.5px] text-white/50">best {s.bestWavelengthUm?.toFixed(2) ?? "—"} µm · anom {s.anomalyGlobal?.toFixed(2)} · track {s.trackProb?.toFixed(2)}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          {r.incomplete ? <Chip tone="warn">incomplete</Chip> : r.anomaly_flag || r.track_flag ? <Chip tone="warn">candidate</Chip> : <Chip tone="signal"><ShieldCheck className="size-3" /> clear</Chip>}
                          <span className="text-[10px] text-white/35">{r.who} · {timeAgo(r.created_at)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Panel>
            </RevealInView>
            <div className="flex justify-end gap-2">
              <Btn variant="outline" href={`/region/${target.order}/${target.ipix}`}>Open region</Btn>
              <Btn variant="primary" href={`/explore?tile=${target.order}/${target.ipix}`}>View in sky</Btn>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

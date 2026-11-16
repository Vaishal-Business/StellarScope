import type { NextRequest } from "next/server";
import { db, now } from "@/server/db";
import { buildScoutInput } from "@/server/scout";

export const maxDuration = 300;

const inflight = new Map<string, Promise<string>>();

/**
 * Streams NDJSON: {type:"progress", msg, frac}… then {type:"input", data} (or {type:"error"}).
 * Inputs are cached in SQLite per position (rounded to 0.001°) so repeat runs are instant.
 */
export async function GET(req: NextRequest) {
  const ra = Number(req.nextUrl.searchParams.get("ra"));
  const dec = Number(req.nextUrl.searchParams.get("dec"));
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra >= 360 || Math.abs(dec) > 90) {
    return Response.json({ error: "ra/dec out of range" }, { status: 400 });
  }
  const key = `v2:${ra.toFixed(3)}:${dec.toFixed(3)}`; // v2 adds spacecraft positions
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const cached = await db().prepare("SELECT payload FROM scout_inputs WHERE key = ?").get(key) as { payload: string } | undefined;
        if (cached) {
          send({ type: "progress", msg: "Using cached real input for this position.", frac: 1 });
          ctrl.enqueue(enc.encode(`{"type":"input","cached":true,"data":${cached.payload}}\n`));
          ctrl.close();
          return;
        }
        let p = inflight.get(key);
        if (!p) {
          p = buildScoutInput(Number(ra.toFixed(5)), Number(dec.toFixed(5)), (msg, frac) => send({ type: "progress", msg, frac })).then((r) => JSON.stringify(r));
          inflight.set(key, p);
          p.finally(() => inflight.delete(key)).catch(() => {});
        } else send({ type: "progress", msg: "Joining a build already in progress for this position…", frac: 0.1 });
        const payload = await p;
        await db().prepare("INSERT INTO scout_inputs (key, payload, created_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at").run(key, payload, now());
        ctrl.enqueue(enc.encode(`{"type":"input","cached":false,"data":${payload}}\n`));
      } catch (e) {
        send({ type: "error", error: (e as Error).message });
      }
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}

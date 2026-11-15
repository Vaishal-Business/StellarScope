import type { NextRequest } from "next/server";
import { db, now } from "@/server/db";
import { HttpError, currentUser, handle, tileArg } from "@/server/auth";
import { ang2pix } from "@/sky/healpix";

/** Records a Spectral Scout run made in the user's browser (summary only, with provenance). */
export async function POST(req: Request) {
  return handle(async () => {
    const me = await currentUser();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const t = tileArg(b.tile_order, b.tile_ipix);
    const ra = Number(b.ra);
    const dec = Number(b.dec);
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) throw new HttpError(400, "ra/dec required");
    const s = b.summary as Record<string, unknown> | undefined;
    if (!s || typeof s !== "object") throw new HttpError(400, "summary required");
    const summary = JSON.stringify(s).slice(0, 30000);
    const r = await db()
      .prepare(
        "INSERT INTO scout_runs (user_id, tile_order, tile_ipix, tile5, ra, dec, model_version, best_channel, track_flag, anomaly_flag, incomplete, summary_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        me?.id ?? null, t.order, t.ipix, ang2pix(5, ra, dec), ra, dec, String(s.modelVersion ?? "unknown").slice(0, 40),
        Number.isInteger(s.bestChannel) ? (s.bestChannel as number) : null, s.trackFlag ? 1 : 0, s.anomalyFlag ? 1 : 0, s.incomplete ? 1 : 0, summary, now(),
      );
    return { id: Number(r.lastInsertRowid) };
  });
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const me = await currentUser();
    const sp = req.nextUrl.searchParams;
    const where: string[] = [];
    const args: number[] = [];
    if (sp.get("mine")) {
      if (!me) return { runs: [] };
      where.push("r.user_id = ?");
      args.push(me.id);
    }
    if (sp.get("tile5")) {
      where.push("r.tile5 = ?");
      args.push(Number(sp.get("tile5")));
    }
    const runs = await db()
      .prepare(`SELECT r.id, r.tile_order, r.tile_ipix, r.tile5, r.ra, r.dec, r.model_version, r.best_channel, r.track_flag, r.anomaly_flag, r.incomplete, r.summary_json, r.created_at, COALESCE(u.display_name, 'Guest') AS who FROM scout_runs r LEFT JOIN users u ON u.id = r.user_id ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY r.created_at DESC LIMIT 50`)
      .all(...args);
    return { runs };
  });
}

import type { NextRequest } from "next/server";
import { db, now } from "@/server/db";
import { HttpError, cleanText, handle, requireUser, tileArg } from "@/server/auth";
import { MISSIONS } from "@/lib/missions";

/** Personal state: saved items, mission progress, claims. GET ?mission=slug for one mission's progress. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const me = await requireUser();
    const d = db();
    const mission = req.nextUrl.searchParams.get("mission");
    const progress = mission
      ? await d.prepare("SELECT mission_slug, stage, objectives_json, updated_at FROM mission_progress WHERE user_id = ? AND mission_slug = ?").all(me.id, mission)
      : await d.prepare("SELECT mission_slug, stage, objectives_json, updated_at FROM mission_progress WHERE user_id = ? ORDER BY updated_at DESC").all(me.id);
    return {
      saved: await d.prepare("SELECT kind, ref, label, created_at FROM saved WHERE user_id = ? ORDER BY created_at DESC").all(me.id),
      progress,
      claims: await d.prepare("SELECT tile_order, tile_ipix, mission_slug, expires_at FROM claims WHERE user_id = ? AND expires_at > ?").all(me.id, now()),
    };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const d = db();
    switch (b.action) {
      case "save": {
        const kind = b.kind === "object" ? "object" : "tile";
        const ref = cleanText(b.ref, 64, "Reference");
        const label = cleanText(b.label ?? ref, 120, "Label");
        const has = await d.prepare("SELECT 1 FROM saved WHERE user_id = ? AND kind = ? AND ref = ?").get(me.id, kind, ref);
        if (has) await d.prepare("DELETE FROM saved WHERE user_id = ? AND kind = ? AND ref = ?").run(me.id, kind, ref);
        else await d.prepare("INSERT INTO saved (user_id, kind, ref, label, created_at) VALUES (?, ?, ?, ?, ?)").run(me.id, kind, ref, label, now());
        return { saved: !has };
      }
      case "progress": {
        const m = MISSIONS.find((x) => x.slug === b.mission_slug);
        if (!m) throw new HttpError(400, "Unknown mission.");
        const stage = Math.max(0, Math.min(6, Math.round(Number(b.stage) || 0)));
        const objectives = Array.isArray(b.objectives) ? b.objectives.slice(0, 10).map(Boolean) : [];
        await d.prepare(
          "INSERT INTO mission_progress (user_id, mission_slug, stage, objectives_json, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, mission_slug) DO UPDATE SET stage = excluded.stage, objectives_json = excluded.objectives_json, updated_at = excluded.updated_at",
        ).run(me.id, m.slug, stage, JSON.stringify(objectives), now());
        return { ok: true };
      }
      case "claim": {
        const m = MISSIONS.find((x) => x.slug === b.mission_slug);
        if (!m) throw new HttpError(400, "Unknown mission.");
        const t = tileArg(b.tile_order, b.tile_ipix);
        const existing = await d.prepare("SELECT user_id, expires_at FROM claims WHERE tile_order = ? AND tile_ipix = ? AND mission_slug = ?").get(t.order, t.ipix, m.slug) as { user_id: number; expires_at: number } | undefined;
        if (existing && existing.expires_at > now() && existing.user_id !== me.id) throw new HttpError(409, "Another contributor has already claimed this tile for this mission.");
        if (existing && existing.user_id === me.id && b.release) {
          await d.prepare("DELETE FROM claims WHERE tile_order = ? AND tile_ipix = ? AND mission_slug = ?").run(t.order, t.ipix, m.slug);
          return { claimed: false };
        }
        await d.prepare("INSERT INTO claims (tile_order, tile_ipix, mission_slug, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (tile_order, tile_ipix, mission_slug) DO UPDATE SET user_id = excluded.user_id, created_at = excluded.created_at, expires_at = excluded.expires_at").run(t.order, t.ipix, m.slug, me.id, now(), now() + 48 * 3600e3);
        return { claimed: true, expires_at: now() + 48 * 3600e3 };
      }
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}

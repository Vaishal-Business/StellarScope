import type { NextRequest } from "next/server";
import { db, now } from "@/server/db";
import { HttpError, cleanText, currentUser, handle, requireUser, tileArg } from "@/server/auth";
import { MISSIONS } from "@/lib/missions";

const INTERPRETATIONS = ["Red-sloped point source", "Absorption feature", "Emission feature", "Moving source", "Artefact / cosmic ray", "No candidate found", "Uncertain"];

export async function GET(req: NextRequest) {
  return handle(async () => {
    const me = await currentUser();
    const sp = req.nextUrl.searchParams;
    const where: string[] = [];
    const args: (string | number)[] = [me?.id ?? -1];
    if (sp.get("status")) {
      where.push("s.status = ?");
      args.push(sp.get("status")!);
    }
    if (sp.get("mine") && me) {
      where.push("s.user_id = ?");
      args.push(me.id);
    }
    if (sp.get("reviewable") && me) {
      where.push("s.user_id != ? AND s.status = 'pending'");
      args.push(me.id);
    }
    const rows = await db()
      .prepare(
        `SELECT s.id, s.mission_slug, s.tile_order, s.tile_ipix, s.interpretation, s.confidence, s.reasoning, s.evidence_json,
                s.status, s.created_at, u.display_name AS author,
                (SELECT COUNT(*) FROM reviews r WHERE r.submission_id = s.id AND r.verdict = 'verify') AS verifies,
                (SELECT COUNT(*) FROM reviews r WHERE r.submission_id = s.id AND r.verdict = 'challenge') AS challenges,
                (SELECT verdict FROM reviews r WHERE r.submission_id = s.id AND r.user_id = ?) AS my_verdict
         FROM submissions s JOIN users u ON u.id = s.user_id ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY s.created_at DESC LIMIT 100`,
      )
      .all(...args);
    return { submissions: rows };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const mission = MISSIONS.find((m) => m.slug === b.mission_slug);
    if (!mission) throw new HttpError(400, "Unknown mission.");
    const t = tileArg(b.tile_order, b.tile_ipix);
    const interpretation = typeof b.interpretation === "string" && INTERPRETATIONS.includes(b.interpretation) ? b.interpretation : null;
    if (!interpretation) throw new HttpError(400, "Choose an interpretation.");
    const confidence = Math.max(0, Math.min(100, Math.round(Number(b.confidence) || 0)));
    const reasoning = cleanText(b.reasoning, 4000, "Reasoning", 20);
    const evidence = b.evidence && typeof b.evidence === "object" ? JSON.stringify(b.evidence).slice(0, 20000) : "{}";
    const d = db();
    const r = await d
      .prepare("INSERT INTO submissions (user_id, mission_slug, tile_order, tile_ipix, interpretation, confidence, reasoning, evidence_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(me.id, mission.slug, t.order, t.ipix, interpretation, confidence, reasoning, evidence, now());
    const id = Number(r.lastInsertRowid);
    await d.prepare("INSERT INTO posts (user_id, room, kind, title, body, tile_order, tile_ipix, submission_id, created_at) VALUES (?, ?, 'submission', ?, ?, ?, ?, ?, ?)")
      .run(me.id, mission.room, `${interpretation} — SPX-${t.order}-${t.ipix}`, reasoning, t.order, t.ipix, id, now());
    await d.prepare("DELETE FROM claims WHERE tile_order = ? AND tile_ipix = ? AND mission_slug = ? AND user_id = ?").run(t.order, t.ipix, mission.slug, me.id);
    return { id };
  });
}

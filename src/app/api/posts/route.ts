import type { NextRequest } from "next/server";
import { db, now } from "@/server/db";
import { HttpError, cleanText, currentUser, handle, requireUser, tileArg } from "@/server/auth";
import { ROOMS as ROOM_DEFS } from "@/lib/missions";

const ROOMS = ROOM_DEFS.map((r) => r.id);

const SELECT = `
  SELECT p.id, p.room, p.kind, p.title, p.body, p.tile_order, p.tile_ipix, p.submission_id, p.created_at,
         u.display_name AS author, u.username,
         (SELECT COUNT(*) FROM votes v WHERE v.post_id = p.id) AS votes,
         (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS replies,
         (SELECT COUNT(*) FROM votes v WHERE v.post_id = p.id AND v.user_id = ?) AS my_vote,
         s.status AS submission_status
  FROM posts p JOIN users u ON u.id = p.user_id LEFT JOIN submissions s ON s.id = p.submission_id`;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const me = await currentUser();
    const sp = req.nextUrl.searchParams;
    const where: string[] = [];
    const args: (string | number)[] = [me?.id ?? -1];
    const room = sp.get("room");
    if (room && room !== "global") {
      where.push("p.room = ?");
      args.push(room);
    }
    const kind = sp.get("kind");
    if (kind) {
      where.push("p.kind = ?");
      args.push(kind);
    }
    if (sp.get("tile")) {
      const [o, i] = sp.get("tile")!.split("/");
      const t = tileArg(o, i);
      where.push("p.tile_order = ? AND p.tile_ipix = ?");
      args.push(t.order, t.ipix);
    }
    if (sp.get("mine") && me) {
      where.push("p.user_id = ?");
      args.push(me.id);
    }
    const limit = Math.min(100, Number(sp.get("limit") ?? 50) || 50);
    const rows = await db().prepare(`${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.created_at DESC LIMIT ${limit}`).all(...args);
    return { posts: rows };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const room = typeof b.room === "string" && ROOMS.includes(b.room) ? b.room : "global";
    const title = cleanText(b.title, 140, "Title", 4);
    const body = cleanText(b.body, 4000, "Message", 1);
    const tile = b.tile_order !== undefined && b.tile_order !== null ? tileArg(b.tile_order, b.tile_ipix) : null;
    const kind = b.kind === "question" ? "question" : "discussion";
    if (kind !== "discussion" && kind !== "question") throw new HttpError(400, "Invalid kind.");
    const r = await db()
      .prepare("INSERT INTO posts (user_id, room, kind, title, body, tile_order, tile_ipix, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(me.id, room, kind, title, body, tile?.order ?? null, tile?.ipix ?? null, now());
    return { id: Number(r.lastInsertRowid) };
  });
}

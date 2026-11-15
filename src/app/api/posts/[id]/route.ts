import { db, now } from "@/server/db";
import { HttpError, cleanText, handle, requireUser } from "@/server/auth";

async function postId(raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid post.");
  if (!await db().prepare("SELECT 1 FROM posts WHERE id = ?").get(id)) throw new HttpError(404, "Post not found.");
  return id;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = await postId((await ctx.params).id);
    const replies = await db()
      .prepare("SELECT r.id, r.body, r.created_at, u.display_name AS author FROM replies r JOIN users u ON u.id = r.user_id WHERE r.post_id = ? ORDER BY r.created_at ASC")
      .all(id);
    return { replies };
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requireUser();
    const id = await postId((await ctx.params).id);
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const d = db();
    if (b.action === "vote") {
      const has = await d.prepare("SELECT 1 FROM votes WHERE post_id = ? AND user_id = ?").get(id, me.id);
      if (has) await d.prepare("DELETE FROM votes WHERE post_id = ? AND user_id = ?").run(id, me.id);
      else await d.prepare("INSERT INTO votes (post_id, user_id) VALUES (?, ?)").run(id, me.id);
      const n = await d.prepare("SELECT COUNT(*) n FROM votes WHERE post_id = ?").get(id) as { n: number };
      return { voted: !has, votes: n.n };
    }
    if (b.action === "reply") {
      const body = cleanText(b.body, 2000, "Reply");
      await d.prepare("INSERT INTO replies (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)").run(id, me.id, body, now());
      return { ok: true };
    }
    throw new HttpError(400, "Unknown action.");
  });
}

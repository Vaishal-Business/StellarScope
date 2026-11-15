import { db, now, userStats } from "@/server/db";
import { handle } from "@/server/auth";
import { MISSIONS } from "@/lib/missions";

/** Platform-wide numbers. Everything is counted from the database; zero means nobody has done it yet. */
export async function GET() {
  return handle(async () => {
    const d = db();
    const n = async (sql: string, ...a: (string | number)[]) => Number((await d.prepare(sql).get(...a) as { n: number } | undefined)?.n ?? 0);
    const missions = Object.fromEntries(
      await Promise.all(MISSIONS.map(async (m) => [
        m.slug,
        {
          participants: await n("SELECT COUNT(DISTINCT user_id) n FROM (SELECT user_id FROM mission_progress WHERE mission_slug = ? UNION SELECT user_id FROM submissions WHERE mission_slug = ?)", m.slug, m.slug),
          submissions: await n("SELECT COUNT(*) n FROM submissions WHERE mission_slug = ?", m.slug),
          verified: await n("SELECT COUNT(*) n FROM submissions WHERE mission_slug = ? AND status = 'verified'", m.slug),
          tiles: await n("SELECT COUNT(DISTINCT tile_order || '/' || tile_ipix) n FROM submissions WHERE mission_slug = ?", m.slug),
          claims: await n("SELECT COUNT(*) n FROM claims WHERE mission_slug = ? AND expires_at > ?", m.slug, now()),
        },
      ])),
    );
    const users = await d.prepare("SELECT id, display_name FROM users").all() as { id: number; display_name: string }[];
    const leaderboard = (await Promise.all(users.map(async (u) => ({ name: u.display_name, ...(await userStats(u.id)) }))))
      .filter((u) => u.xp > 0)
      .sort((a, b) => b.verified - a.verified || b.reviews - a.reviews || b.xp - a.xp)
      .slice(0, 10);
    const activity = await d
      .prepare(
        `SELECT * FROM (
           SELECT 'post' AS type, p.created_at AS t, u.display_name AS who, p.title AS what, p.tile_order AS o, p.tile_ipix AS i FROM posts p JOIN users u ON u.id = p.user_id
           UNION ALL SELECT 'review', r.created_at, u.display_name, r.verdict || ' · submission #' || r.submission_id, s.tile_order, s.tile_ipix FROM reviews r JOIN users u ON u.id = r.user_id JOIN submissions s ON s.id = r.submission_id
           UNION ALL SELECT 'scout', sr.created_at, COALESCE(u.display_name, 'Guest'), 'Spectral Scout run', sr.tile_order, sr.tile_ipix FROM scout_runs sr LEFT JOIN users u ON u.id = sr.user_id
           UNION ALL SELECT 'claim', c.created_at, u.display_name, 'claimed for ' || c.mission_slug, c.tile_order, c.tile_ipix FROM claims c JOIN users u ON u.id = c.user_id
         ) ORDER BY t DESC LIMIT 12`,
      )
      .all();
    return {
      totals: {
        users: users.length,
        posts: await n("SELECT COUNT(*) n FROM posts"),
        submissions: await n("SELECT COUNT(*) n FROM submissions"),
        verified: await n("SELECT COUNT(*) n FROM submissions WHERE status = 'verified'"),
        pendingReviews: await n("SELECT COUNT(*) n FROM submissions WHERE status = 'pending'"),
        scoutRuns: await n("SELECT COUNT(*) n FROM scout_runs"),
        scoutTiles: await n("SELECT COUNT(DISTINCT tile5) n FROM scout_runs"),
        candidates: await n("SELECT COUNT(DISTINCT tile5) n FROM scout_runs WHERE (track_flag = 1 OR anomaly_flag = 1) AND incomplete = 0"),
        reviewedTiles: await n("SELECT COUNT(DISTINCT tile_order || '/' || tile_ipix) n FROM submissions WHERE status != 'pending' OR id IN (SELECT submission_id FROM reviews)"),
      },
      missions,
      leaderboard,
      activity,
    };
  });
}

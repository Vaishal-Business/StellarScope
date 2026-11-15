import { db, now } from "@/server/db";
import { handle } from "@/server/auth";

/**
 * Real per-tile status sets for the Explore map layers. Returned as {order, ipix} lists;
 * the client marks a tile at any order if it contains a listed tile.
 */
export async function GET() {
  return handle(async () => {
    const d = db();
    const rows = async (sql: string, ...a: number[]) => await d.prepare(sql).all(...a) as { o: number; i: number }[];
    return {
      screened: await rows("SELECT DISTINCT 5 AS o, tile5 AS i FROM scout_runs"),
      candidates: await rows("SELECT DISTINCT 5 AS o, tile5 AS i FROM scout_runs WHERE (track_flag = 1 OR anomaly_flag = 1) AND incomplete = 0"),
      reviewed: await rows("SELECT DISTINCT tile_order AS o, tile_ipix AS i FROM submissions WHERE status != 'pending' OR id IN (SELECT submission_id FROM reviews)"),
      submitted: await rows("SELECT DISTINCT tile_order AS o, tile_ipix AS i FROM submissions"),
      claimed: await rows("SELECT DISTINCT tile_order AS o, tile_ipix AS i FROM claims WHERE expires_at > ?", now()),
    };
  });
}

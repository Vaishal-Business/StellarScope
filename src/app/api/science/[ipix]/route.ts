import { NextResponse, type NextRequest } from "next/server";
import { indexFits, readBinTable } from "@/server/fits";
import { scienceUrl } from "@/sky/spherex";
import { parseIpix } from "@/server/params";

/** HDU index + headers of the DR1 order-5 science cube, plus the decoded SPECTRAL_CHANNELS table. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/science/[ipix]">) {
  const { ipix: raw } = await ctx.params;
  const ipix = parseIpix(raw);
  if (ipix === null) return NextResponse.json({ error: "ipix must be an order-5 NESTED index 0–12287" }, { status: 400 });
  const url = scienceUrl(ipix);
  try {
    const idx = await indexFits(url);
    const spec = idx.hdus.find((h) => h.name === "SPECTRAL_CHANNELS");
    const wave = idx.hdus.find((h) => h.name === "WCS-WAVE");
    const [spectral, wcsWave] = await Promise.all([
      spec ? readBinTable(url, spec).catch(() => null) : null,
      wave ? readBinTable(url, wave).catch(() => null) : null,
    ]);
    return NextResponse.json(
      { ipix, ...idx, spectral, wcsWave },
      { headers: { "Cache-Control": "public, max-age=86400" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, url }, { status: 502 });
  }
}

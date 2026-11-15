import { NextResponse, type NextRequest } from "next/server";
import { indexFits, readPixelSpectrum } from "@/server/fits";
import { scienceUrl } from "@/sky/spherex";
import { parseIpix } from "@/server/params";

const memo = new Map<string, unknown>();

/** 102-channel calibrated spectrum (IMAGE, MJy/sr) + NHITS + FLAGS at one cube pixel. ?x=0..511&y=0..511 (0-based FITS axes). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/science/[ipix]/spectrum">) {
  const { ipix: raw } = await ctx.params;
  const ipix = parseIpix(raw);
  const x = Number(req.nextUrl.searchParams.get("x"));
  const y = Number(req.nextUrl.searchParams.get("y"));
  if (ipix === null || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 511 || y > 511) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const key = `${ipix}:${x}:${y}`;
  if (memo.has(key)) return NextResponse.json(memo.get(key));
  try {
    const url = scienceUrl(ipix);
    const idx = await indexFits(url);
    const image = idx.hdus.find((h) => h.name === "IMAGE");
    const nhits = idx.hdus.find((h) => h.name === "NHITS");
    const flags = idx.hdus.find((h) => h.name === "FLAGS");
    if (!image) throw new Error("IMAGE extension missing");
    const [flux, hits, fl] = await Promise.all([
      readPixelSpectrum(url, image, x, y),
      nhits ? readPixelSpectrum(url, nhits, x, y) : Promise.resolve(null),
      flags ? readPixelSpectrum(url, flags, x, y) : Promise.resolve(null),
    ]);
    const bunit = image.cards.find((c) => c.key === "BUNIT")?.value ?? "";
    const body = { ipix, x, y, bunit, flux: flux.map((v) => (Number.isFinite(v) ? v : null)), nhits: hits, flags: fl };
    if (memo.size > 400) memo.clear();
    memo.set(key, body);
    return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

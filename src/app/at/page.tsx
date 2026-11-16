import { redirect } from "next/navigation";
import { ang2pix } from "@/sky/healpix";

export const metadata = { title: "Go to coordinates · StellarScope" };
export const instant = false;

/** Shareable link: /at?ra=<deg>&dec=<deg> opens the containing region with ChronoLens on that spot. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ra = Number(sp.ra), dec = Number(sp.dec);
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || dec < -90 || dec > 90) redirect("/explore");
  const r = ((ra % 360) + 360) % 360;
  redirect(`/region/5/${ang2pix(5, r, dec)}?ra=${+r.toFixed(6)}&dec=${+dec.toFixed(6)}#chronolens`);
}

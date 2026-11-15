/** Parses "83.82 -5.39", "05h35m17s -05°23′28″", "5:35:17 -5:23:28" or "SPX-5-00445" / "5/445". */
export function parseQuery(q: string): { ra: number; dec: number } | { order: number; ipix: number } | null {
  const s = q.trim();
  const tile = /^(?:spx-)?(\d)[/\-:\s]+0*(\d+)$/i.exec(s);
  if (tile) {
    const order = Number(tile[1]);
    const ipix = Number(tile[2]);
    if (order <= 5 && ipix < 12 * 4 ** order) return { order, ipix };
  }
  const sex = /^(\d{1,2})[h:\s]\s*(\d{1,2})[m:\s]\s*([\d.]+)s?\s+([+\-−]?)(\d{1,2})[°d:\s]\s*(\d{1,2})['′m:\s]\s*([\d.]+)/i.exec(s);
  if (sex) {
    const ra = (Number(sex[1]) + Number(sex[2]) / 60 + Number(sex[3]) / 3600) * 15;
    const sign = sex[4] === "-" || sex[4] === "−" ? -1 : 1;
    const dec = sign * (Number(sex[5]) + Number(sex[6]) / 60 + Number(sex[7]) / 3600);
    if (ra < 360 && Math.abs(dec) <= 90) return { ra, dec };
  }
  const deg = /^([\d.]+)[,\s]+([+\-−]?[\d.]+)$/.exec(s);
  if (deg) {
    const ra = Number(deg[1]);
    const dec = Number(deg[2].replace("−", "-"));
    if (ra >= 0 && ra < 360 && Math.abs(dec) <= 90) return { ra, dec };
  }
  return null;
}

/** Validates an order-5 NESTED pixel index; URLs are only ever built from constants + this integer. */
export function parseIpix(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < 12288 ? n : null;
}

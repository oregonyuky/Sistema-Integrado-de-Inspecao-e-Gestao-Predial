/** Limitador simples em memória (por processo) para tentativas de login. */
const hits = new Map<string, { n: number; reset: number }>();
const WINDOW = 15 * 60 * 1000;
const MAX = 10;

export function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) return false;
  return h.n >= MAX;
}
export function registerFailure(key: string) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + WINDOW });
  else h.n++;
}
export function clearFailures(key: string) {
  hits.delete(key);
}

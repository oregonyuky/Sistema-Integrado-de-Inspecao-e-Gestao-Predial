/** Data de hoje (AAAA-MM-DD) no fuso da aplicação (padrão: America/Sao_Paulo). */
export function todayISO(now: Date = new Date(), tz = process.env.APP_TIMEZONE || "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function currentYear(now: Date = new Date()): number {
  return Number(todayISO(now).slice(0, 4));
}

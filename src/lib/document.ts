/** Validação e normalização de CPF/CNPJ (inclui CNPJ alfanumérico, vigente desde jul/2026). */

export function normalizeDocument(raw: string): string {
  return raw.replace(/[.\-/\s]/g, "").toUpperCase();
}

export function isValidCPF(raw: string): boolean {
  const d = normalizeDocument(raw);
  if (!/^\d{11}$/.test(d)) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

const CNPJ_W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function isValidCNPJ(raw: string): boolean {
  const d = normalizeDocument(raw);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(d)) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const val = (ch: string) => ch.charCodeAt(0) - 48; // 0-9 → 0-9, A → 17 ...
  const dv = (weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += val(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(CNPJ_W1) === Number(d[12]) && dv(CNPJ_W2) === Number(d[13]);
}

export function formatDocument(doc: string | null | undefined): string {
  if (!doc) return "";
  if (/^\d{11}$/.test(doc)) return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (/^[0-9A-Z]{12}[0-9]{2}$/.test(doc)) return doc.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
  return doc;
}

/** CPF mascarado para perfis sem permissão de ver dados pessoais (LGPD). */
export function maskDocument(doc: string | null | undefined): string | null {
  if (!doc) return null;
  if (doc.length === 11) return `***.${doc.slice(3, 6)}.***-**`;
  return doc;
}

export const BR_STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
] as const;

import type { Tx } from "./db";
import type { Ctx } from "./context";

const norm = (v: unknown): unknown => {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object" && "toFixed" in (v as object)) return String(v); // Decimal
  return v;
};

/**
 * Diferença campo a campo. Campos listados em `redact` (dados pessoais) têm o valor
 * omitido da trilha — registra-se apenas que mudaram (minimização, LGPD).
 */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  opts: { redact?: string[] } = {},
): Record<string, { from: unknown; to: unknown } | { changed: true }> | null {
  const out: Record<string, { from: unknown; to: unknown } | { changed: true }> = {};
  for (const key of Object.keys(after)) {
    if (["createdAt", "updatedAt"].includes(key)) continue;
    const a = norm(before[key]);
    const b = norm(after[key]);
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    out[key] = opts.redact?.includes(key) ? { changed: true } : { from: a, to: b };
  }
  return Object.keys(out).length ? out : null;
}

export async function audit(
  tx: Tx,
  ctx: Ctx,
  entityType: string,
  entityId: string,
  action: string,
  changes?: unknown,
) {
  await tx.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      entityType,
      entityId,
      action,
      changes: changes === undefined || changes === null ? undefined : (changes as object),
    },
  });
}

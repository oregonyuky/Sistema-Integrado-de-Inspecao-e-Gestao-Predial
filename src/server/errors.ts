import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Registro") => new AppError(404, "NOT_FOUND", `${what} não encontrado.`);
export const forbidden = (msg = "Você não tem permissão para realizar esta ação.") => new AppError(403, "FORBIDDEN", msg);
export const unauthorized = (msg = "Sessão inválida ou expirada. Entre novamente.") => new AppError(401, "UNAUTHENTICATED", msg);
export const conflict = (code: string, msg: string, details?: unknown) => new AppError(409, code, msg, details);
export const invalid = (msg: string, fields?: Record<string, string>) =>
  new AppError(422, "VALIDATION", msg, fields ? { fields } : undefined);

/** Converte qualquer erro em AppError sem expor detalhes internos. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;

  if (e instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of e.issues) {
      const key = issue.path.join(".") || "_";
      if (!fields[key]) fields[key] = issue.message;
    }
    return new AppError(422, "VALIDATION", "Revise os campos destacados.", { fields });
  }

  const err = e as { code?: string; message?: string; meta?: unknown };
  const msg = typeof err?.message === "string" ? err.message : "";

  // Regras de integridade do banco (triggers): mensagens começam com "integrity:".
  const m = /integrity:\s*([^\n]+)/.exec(msg);
  if (m) return new AppError(409, "INTEGRITY", capitalize(m[1].replace(/[`'"]/g, "").trim()) + ".");

  if (err?.code === "P2002") return new AppError(409, "DUPLICATE", "Já existe um registro com estes dados.");
  if (err?.code === "P2003") return new AppError(409, "REFERENCE", "Operação bloqueada: existem registros relacionados.");
  if (err?.code === "P2025") return notFound();
  if (/violates check constraint/i.test(msg) || err?.code === "23514")
    return new AppError(422, "VALIDATION", "Algum dado informado é inválido.");

  console.error("[siigp] erro interno:", e);
  return new AppError(500, "INTERNAL", "Ocorreu um erro inesperado. Tente novamente.");
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

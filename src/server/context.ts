import { forbidden } from "./errors";

export type Role = "ADMIN" | "EDITOR" | "VIEWER";

/** Contexto de uma requisição autenticada. Toda consulta é escopada por organizationId. */
export interface Ctx {
  organizationId: string;
  userId: string;
  role: Role;
}

export const canWrite = (ctx: Ctx) => ctx.role === "ADMIN" || ctx.role === "EDITOR";
export const isAdmin = (ctx: Ctx) => ctx.role === "ADMIN";
/** Dados pessoais (CPF, e-mail e telefone de pessoas físicas) só para quem edita cadastros. */
export const canViewPersonalData = (ctx: Ctx) => canWrite(ctx);

export function requireWrite(ctx: Ctx) {
  if (!canWrite(ctx)) throw forbidden("Seu perfil permite apenas consulta.");
}

export function requireAdmin(ctx: Ctx) {
  if (!isAdmin(ctx)) throw forbidden("Esta ação exige perfil de administrador.");
}

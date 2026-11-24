import type { PrismaClient } from "@prisma/client";
import type { Tx } from "../db";
import type { Ctx } from "../context";
import { conflict, invalid, notFound } from "../errors";

export type Db = PrismaClient | Tx;

export async function loadProject(db: Db, ctx: Ctx, projectId: string) {
  const p = await db.project.findFirst({ where: { id: projectId, organizationId: ctx.organizationId } });
  if (!p) throw notFound("Empreendimento");
  return p;
}

export async function loadActiveProject(db: Db, ctx: Ctx, projectId: string) {
  const p = await loadProject(db, ctx, projectId);
  if (p.status !== "ACTIVE") throw conflict("INACTIVE", "O empreendimento está inativo. Reative-o para cadastrar novos elementos.");
  return p;
}

export async function loadBuilding(db: Db, ctx: Ctx, id: string) {
  const b = await db.building.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!b) throw notFound("Edificação");
  return b;
}

export async function loadLocation(db: Db, ctx: Ctx, id: string) {
  const l = await db.location.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { privateUnit: true },
  });
  if (!l) throw notFound("Localização");
  return l;
}

export function ensureUuid(id: string, what = "Registro") {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw notFound(what);
}

export function pageArgs(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function fail422(field: string, message: string): never {
  throw invalid(message, { [field]: message });
}

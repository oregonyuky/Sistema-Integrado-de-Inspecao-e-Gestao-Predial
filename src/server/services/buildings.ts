import { db } from "../db";
import type { Ctx } from "../context";
import { requireWrite } from "../context";
import { conflict } from "../errors";
import { audit, diff } from "../audit";
import { buildingSchema, reorderSchema } from "../validation";
import { serializeBuilding } from "../serializers";
import { ensureUuid, loadActiveProject, loadBuilding, loadProject } from "./common";

export async function listBuildings(ctx: Ctx, projectId: string, rawQuery?: { status?: string }) {
  ensureUuid(projectId, "Empreendimento");
  await loadProject(db, ctx, projectId);
  const where: Record<string, unknown> = { projectId, organizationId: ctx.organizationId };
  if (rawQuery?.status === "ACTIVE" || rawQuery?.status === "INACTIVE") where.status = rawQuery.status;
  const rows = await db.building.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const counts = await db.location.groupBy({
    by: ["buildingId", "locationType"],
    where: { projectId, organizationId: ctx.organizationId, buildingId: { not: null } },
    _count: { _all: true },
  });
  return rows.map((b) => {
    const mine = counts.filter((c) => c.buildingId === b.id);
    return {
      ...serializeBuilding(b),
      floorCount: mine.filter((c) => c.locationType === "FLOOR").reduce((s, c) => s + c._count._all, 0),
      locationCount: mine.reduce((s, c) => s + c._count._all, 0),
    };
  });
}

export async function getBuilding(ctx: Ctx, id: string) {
  ensureUuid(id, "Edificação");
  return serializeBuilding(await loadBuilding(db, ctx, id));
}

async function assertCodeFree(projectId: string, code: string, exceptId?: string) {
  const dup = await db.building.findFirst({ where: { projectId, code, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (dup) throw conflict("DUPLICATE_CODE", "Já existe uma edificação com este código no empreendimento.", { fields: { code: "Código já utilizado neste empreendimento." } });
}

export async function createBuilding(ctx: Ctx, projectId: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(projectId, "Empreendimento");
  const input = buildingSchema.parse(raw);
  await loadActiveProject(db, ctx, projectId);
  await assertCodeFree(projectId, input.code);
  return db.$transaction(async (tx) => {
    const max = await tx.building.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    const b = await tx.building.create({
      data: { ...input, projectId, organizationId: ctx.organizationId, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
    await audit(tx, ctx, "building", b.id, "CREATE");
    return serializeBuilding(b);
  });
}

export async function updateBuilding(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(id, "Edificação");
  const input = buildingSchema.parse(raw);
  const before = await loadBuilding(db, ctx, id);
  if (input.code !== before.code) await assertCodeFree(before.projectId, input.code, id);
  return db.$transaction(async (tx) => {
    const b = await tx.building.update({ where: { id }, data: input });
    const changes = diff(before, b);
    if (changes) await audit(tx, ctx, "building", id, "UPDATE", changes);
    return serializeBuilding(b);
  });
}

/**
 * Desativação lógica: a edificação e suas localizações passam a INACTIVE,
 * mas todos os registros (e relacionamentos) são preservados.
 */
export async function deactivateBuilding(ctx: Ctx, id: string) {
  requireWrite(ctx);
  ensureUuid(id, "Edificação");
  const before = await loadBuilding(db, ctx, id);
  return db.$transaction(async (tx) => {
    const b = await tx.building.update({ where: { id }, data: { status: "INACTIVE" } });
    const { count } = await tx.location.updateMany({
      where: { buildingId: id, organizationId: ctx.organizationId, status: "ACTIVE" },
      data: { status: "INACTIVE" },
    });
    if (before.status !== "INACTIVE" || count > 0)
      await audit(tx, ctx, "building", id, "DEACTIVATE", { locationsDeactivated: count });
    return { ...serializeBuilding(b), locationsDeactivated: count };
  });
}

export async function reactivateBuilding(ctx: Ctx, id: string, opts: { includeDescendants?: boolean } = {}) {
  requireWrite(ctx);
  ensureUuid(id, "Edificação");
  const before = await loadBuilding(db, ctx, id);
  await loadActiveProject(db, ctx, before.projectId);
  return db.$transaction(async (tx) => {
    const b = await tx.building.update({ where: { id }, data: { status: "ACTIVE" } });
    let count = 0;
    if (opts.includeDescendants) {
      ({ count } = await tx.location.updateMany({
        where: { buildingId: id, organizationId: ctx.organizationId, status: "INACTIVE" },
        data: { status: "ACTIVE" },
      }));
    }
    await audit(tx, ctx, "building", id, "REACTIVATE", { locationsReactivated: count });
    return { ...serializeBuilding(b), locationsReactivated: count };
  });
}

/** Exclusão física só é permitida para edificações sem nenhuma localização relacionada. */
export async function deleteBuilding(ctx: Ctx, id: string) {
  requireWrite(ctx);
  ensureUuid(id, "Edificação");
  const b = await loadBuilding(db, ctx, id);
  const related = await db.location.count({ where: { buildingId: id } });
  if (related > 0)
    throw conflict(
      "HAS_RELATED_RECORDS",
      `Não é possível excluir: a edificação possui ${related} localização(ões) cadastrada(s). Desative-a para preservar o histórico.`,
    );
  await db.$transaction(async (tx) => {
    await tx.building.delete({ where: { id } });
    await audit(tx, ctx, "building", id, "DELETE", { code: b.code, name: b.name });
  });
  return { ok: true };
}

export async function reorderBuilding(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(id, "Edificação");
  const { direction } = reorderSchema.parse(raw);
  const b = await loadBuilding(db, ctx, id);
  await db.$transaction(async (tx) => {
    const siblings = await tx.building.findMany({
      where: { projectId: b.projectId, organizationId: ctx.organizationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true },
    });
    const i = siblings.findIndex((s) => s.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= siblings.length) return;
    [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
    for (let k = 0; k < siblings.length; k++) {
      await tx.building.update({ where: { id: siblings[k].id }, data: { sortOrder: k } });
    }
  });
  return { ok: true };
}

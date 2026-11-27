import type { InspectionCriterion } from "@prisma/client";
import { db } from "../db";
import type { Ctx } from "../context";
import { requireWrite } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { audit, diff } from "../audit";
import { criterionSchema, reorderSchema } from "../validation";
import { num } from "../serializers";
import { ensureUuid } from "./common";
import { loadCatalogItem } from "./catalog";

const ser = (k: InspectionCriterion) => ({
  id: k.id, typeId: k.typeId, code: k.code, label: k.label, description: k.description, responseType: k.responseType, required: k.required,
  unit: k.unit, minValue: num(k.minValue), maxValue: num(k.maxValue), options: k.options, sortOrder: k.sortOrder, status: k.status,
});

async function load(ctx: Ctx, id: string) {
  ensureUuid(id, "Critério");
  const k = await db.inspectionCriterion.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!k) throw notFound("Critério");
  return k;
}

/** Critérios que formam o formulário de inspeção de um tipo de componente (RF-020). */
export async function listCriteria(ctx: Ctx, typeId: string, q: { status?: string } = {}) {
  const t = await loadCatalogItem(db, ctx, typeId);
  if (t.kind !== "TYPE") throw invalid("Critérios pertencem a tipos de componente.");
  const rows = await db.inspectionCriterion.findMany({
    where: { typeId, organizationId: ctx.organizationId, ...(q.status === "ACTIVE" || q.status === "INACTIVE" ? { status: q.status } : {}) },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return rows.map(ser);
}

export async function createCriterion(ctx: Ctx, typeId: string, raw: unknown) {
  requireWrite(ctx);
  const input = criterionSchema.parse(raw);
  const t = await loadCatalogItem(db, ctx, typeId);
  if (t.kind !== "TYPE") throw invalid("Critérios pertencem a tipos de componente.");
  if (t.status !== "ACTIVE") throw conflict("INACTIVE", "O tipo está inativo.");
  if (await db.inspectionCriterion.findUnique({ where: { typeId_code: { typeId, code: input.code } } }))
    throw conflict("DUPLICATE_CODE", "Já existe um critério com este código neste tipo.", { fields: { code: "Código já utilizado neste tipo." } });
  return db.$transaction(async (tx) => {
    const max = await tx.inspectionCriterion.aggregate({ where: { typeId }, _max: { sortOrder: true } });
    const k = await tx.inspectionCriterion.create({ data: { ...input, typeId, organizationId: ctx.organizationId, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
    await audit(tx, ctx, "criterion", k.id, "CREATE", { type: t.code, code: k.code });
    return ser(k);
  });
}

export async function updateCriterion(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  const input = criterionSchema.parse(raw);
  const before = await load(ctx, id);
  if (input.code !== before.code && (await db.inspectionCriterion.findUnique({ where: { typeId_code: { typeId: before.typeId, code: input.code } } })))
    throw conflict("DUPLICATE_CODE", "Já existe um critério com este código neste tipo.", { fields: { code: "Código já utilizado neste tipo." } });
  return db.$transaction(async (tx) => {
    const k = await tx.inspectionCriterion.update({ where: { id }, data: input });
    const c = diff({ ...before, minValue: num(before.minValue), maxValue: num(before.maxValue) }, { ...k, minValue: num(k.minValue), maxValue: num(k.maxValue) });
    if (c) await audit(tx, ctx, "criterion", id, "UPDATE", c);
    return ser(k);
  });
}

export async function setCriterionStatus(ctx: Ctx, id: string, status: "ACTIVE" | "INACTIVE") {
  requireWrite(ctx);
  await load(ctx, id);
  return db.$transaction(async (tx) => {
    const k = await tx.inspectionCriterion.update({ where: { id }, data: { status } });
    await audit(tx, ctx, "criterion", id, status === "ACTIVE" ? "REACTIVATE" : "DEACTIVATE");
    return ser(k);
  });
}

export async function reorderCriterion(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  const { direction } = reorderSchema.parse(raw);
  const k = await load(ctx, id);
  await db.$transaction(async (tx) => {
    const sib = await tx.inspectionCriterion.findMany({ where: { typeId: k.typeId }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { id: true } });
    const i = sib.findIndex((s) => s.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= sib.length) return;
    [sib[i], sib[j]] = [sib[j], sib[i]];
    for (let n = 0; n < sib.length; n++) await tx.inspectionCriterion.update({ where: { id: sib[n].id }, data: { sortOrder: n } });
  });
  return { ok: true };
}

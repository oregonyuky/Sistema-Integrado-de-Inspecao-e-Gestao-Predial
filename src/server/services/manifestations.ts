import { db } from "../db";
import type { Ctx } from "../context";
import { requireWrite } from "../context";
import { conflict, notFound } from "../errors";
import { audit, diff } from "../audit";
import { classificationSchema, manifestationSchema } from "../validation";
import { ensureUuid } from "./common";

const dup = (msg: string) => conflict("DUPLICATE_CODE", msg, { fields: { code: msg } });

const serC = (c: { id: string; code: string; name: string; kind: string; description: string | null; sortOrder: number; status: string }) =>
  ({ id: c.id, code: c.code, name: c.name, kind: c.kind, description: c.description, sortOrder: c.sortOrder, status: c.status });

// ───────── Classificações técnicas (biblioteca própria, distinta das manifestações) ─────────
export async function listClassifications(ctx: Ctx, q: { kind?: string; status?: string } = {}) {
  const rows = await db.technicalClassification.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(q.status === "ACTIVE" || q.status === "INACTIVE" ? { status: q.status } : {}),
      ...(q.kind ? { kind: q.kind as never } : {}),
    },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
  });
  return rows.map(serC);
}
export async function createClassification(ctx: Ctx, raw: unknown) {
  requireWrite(ctx);
  const input = classificationSchema.parse(raw);
  if (await db.technicalClassification.findUnique({ where: { organizationId_code: { organizationId: ctx.organizationId, code: input.code } } })) throw dup("Código já utilizado.");
  return db.$transaction(async (tx) => {
    const max = await tx.technicalClassification.aggregate({ where: { organizationId: ctx.organizationId, kind: input.kind }, _max: { sortOrder: true } });
    const c = await tx.technicalClassification.create({ data: { ...input, organizationId: ctx.organizationId, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
    await audit(tx, ctx, "classification", c.id, "CREATE", { code: c.code });
    return serC(c);
  });
}
export async function updateClassification(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(id, "Classificação");
  const input = classificationSchema.parse(raw);
  const before = await db.technicalClassification.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!before) throw notFound("Classificação");
  if (input.code !== before.code && (await db.technicalClassification.findUnique({ where: { organizationId_code: { organizationId: ctx.organizationId, code: input.code } } }))) throw dup("Código já utilizado.");
  return db.$transaction(async (tx) => {
    const c = await tx.technicalClassification.update({ where: { id }, data: input });
    const ch = diff(before, c);
    if (ch) await audit(tx, ctx, "classification", id, "UPDATE", ch);
    return serC(c);
  });
}
export async function setClassificationStatus(ctx: Ctx, id: string, status: "ACTIVE" | "INACTIVE") {
  requireWrite(ctx);
  ensureUuid(id, "Classificação");
  if (!(await db.technicalClassification.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } }))) throw notFound("Classificação");
  return db.$transaction(async (tx) => {
    const c = await tx.technicalClassification.update({ where: { id }, data: { status } });
    await audit(tx, ctx, "classification", id, status === "ACTIVE" ? "REACTIVATE" : "DEACTIVATE");
    return serC(c);
  });
}

// ───────── Manifestações ─────────
type M = { id: string; code: string; name: string; description: string | null; typicalCauses: string | null; status: string; classLinks: { classification: Parameters<typeof serC>[0] }[] };
const serM = (m: M) => ({
  id: m.id, code: m.code, name: m.name, description: m.description, typicalCauses: m.typicalCauses, status: m.status,
  classifications: m.classLinks.map((l) => serC(l.classification)),
});
const inc = { classLinks: { include: { classification: true } } } as const;

export async function listManifestations(ctx: Ctx, q: { q?: string; status?: string } = {}) {
  const rows = await db.manifestation.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(q.status === "ACTIVE" || q.status === "INACTIVE" ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { code: { contains: q.q, mode: "insensitive" } }] } : {}),
    },
    include: inc, orderBy: { code: "asc" },
  });
  return rows.map(serM);
}

async function checkClassIds(ctx: Ctx, ids: string[]) {
  if (!ids.length) return;
  const uniq = [...new Set(ids)];
  const found = await db.technicalClassification.findMany({ where: { id: { in: uniq }, organizationId: ctx.organizationId, status: "ACTIVE" }, select: { id: true } });
  if (found.length !== uniq.length) throw conflict("INVALID_REFERENCE", "Alguma classificação informada não existe ou está inativa.", { fields: { classificationIds: "Classificação inválida." } });
}

export async function createManifestation(ctx: Ctx, raw: unknown) {
  requireWrite(ctx);
  const { classificationIds, ...input } = manifestationSchema.parse(raw);
  if (await db.manifestation.findUnique({ where: { organizationId_code: { organizationId: ctx.organizationId, code: input.code } } })) throw dup("Código já utilizado.");
  await checkClassIds(ctx, classificationIds);
  return db.$transaction(async (tx) => {
    const m = await tx.manifestation.create({
      data: { ...input, organizationId: ctx.organizationId, classLinks: { create: [...new Set(classificationIds)].map((classificationId) => ({ classificationId, organizationId: ctx.organizationId })) } },
      include: inc,
    });
    await audit(tx, ctx, "manifestation", m.id, "CREATE", { code: m.code });
    return serM(m);
  });
}
export async function updateManifestation(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(id, "Manifestação");
  const { classificationIds, ...input } = manifestationSchema.parse(raw);
  const before = await db.manifestation.findFirst({ where: { id, organizationId: ctx.organizationId }, include: inc });
  if (!before) throw notFound("Manifestação");
  if (input.code !== before.code && (await db.manifestation.findUnique({ where: { organizationId_code: { organizationId: ctx.organizationId, code: input.code } } }))) throw dup("Código já utilizado.");
  await checkClassIds(ctx, classificationIds);
  return db.$transaction(async (tx) => {
    await tx.manifestationClassification.deleteMany({ where: { manifestationId: id } });
    const m = await tx.manifestation.update({
      where: { id },
      data: { ...input, classLinks: { create: [...new Set(classificationIds)].map((classificationId) => ({ classificationId, organizationId: ctx.organizationId })) } },
      include: inc,
    });
    const ch = diff(
      { ...before, classificationIds: before.classLinks.map((l) => l.classificationId).sort() },
      { ...m, classificationIds: m.classLinks.map((l) => l.classificationId).sort() },
    );
    if (ch) await audit(tx, ctx, "manifestation", id, "UPDATE", ch);
    return serM(m);
  });
}
export async function setManifestationStatus(ctx: Ctx, id: string, status: "ACTIVE" | "INACTIVE") {
  requireWrite(ctx);
  ensureUuid(id, "Manifestação");
  if (!(await db.manifestation.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } }))) throw notFound("Manifestação");
  return db.$transaction(async (tx) => {
    const m = await tx.manifestation.update({ where: { id }, data: { status }, include: inc });
    await audit(tx, ctx, "manifestation", id, status === "ACTIVE" ? "REACTIVATE" : "DEACTIVATE");
    return serM(m);
  });
}

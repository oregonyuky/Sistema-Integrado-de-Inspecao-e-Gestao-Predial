import { db } from "../db";
import type { Ctx } from "../context";
import { requireWrite } from "../context";
import { conflict, notFound } from "../errors";
import { audit, diff } from "../audit";
import { normEditionSchema, normLinkSchema, normSchema, normSectionSchema, toDate } from "../validation";
import { day, ts } from "../serializers";
import { ensureUuid } from "./common";
import { catalogChain, loadCatalogItem } from "./catalog";

const dupCode = (field: string, msg: string) => conflict("DUPLICATE_CODE", msg, { fields: { [field]: msg } });

async function loadNorm(ctx: Ctx, id: string) {
  ensureUuid(id, "Norma");
  const n = await db.norm.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!n) throw notFound("Norma");
  return n;
}
async function loadEdition(ctx: Ctx, id: string) {
  ensureUuid(id, "Edição");
  const e = await db.normEdition.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!e) throw notFound("Edição");
  return e;
}
async function loadSection(ctx: Ctx, id: string) {
  ensureUuid(id, "Seção");
  const s = await db.normSection.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!s) throw notFound("Seção");
  return s;
}

const sNorm = (n: { id: string; code: string; title: string; issuer: string | null; description: string | null; status: string; createdAt: Date }) =>
  ({ id: n.id, code: n.code, title: n.title, issuer: n.issuer, description: n.description, status: n.status, createdAt: ts(n.createdAt) });
const sEdition = (e: { id: string; normId: string; edition: string; publishedOn: Date | null; isCurrent: boolean; notes: string | null; status: string }) =>
  ({ id: e.id, normId: e.normId, edition: e.edition, publishedOn: day(e.publishedOn), isCurrent: e.isCurrent, notes: e.notes, status: e.status });
const sSection = (s: { id: string; editionId: string; ref: string; title: string; summary: string | null; sortOrder: number; status: string }) =>
  ({ id: s.id, editionId: s.editionId, ref: s.ref, title: s.title, summary: s.summary, sortOrder: s.sortOrder, status: s.status });

/** Normas com edições e seções (RF-019). */
export async function listNorms(ctx: Ctx, q: { q?: string; status?: string } = {}) {
  const where: Record<string, unknown> = { organizationId: ctx.organizationId };
  if (q.status === "ACTIVE" || q.status === "INACTIVE") where.status = q.status;
  if (q.q) where.OR = [{ code: { contains: q.q, mode: "insensitive" } }, { title: { contains: q.q, mode: "insensitive" } }];
  const norms = await db.norm.findMany({
    where, orderBy: { code: "asc" },
    include: { editions: { orderBy: [{ isCurrent: "desc" }, { edition: "desc" }], include: { sections: { orderBy: [{ sortOrder: "asc" }, { ref: "asc" }] } } } },
  });
  const links = await db.catalogItemNormSection.groupBy({ by: ["sectionId"], where: { organizationId: ctx.organizationId }, _count: { _all: true } });
  return norms.map((n) => ({
    ...sNorm(n),
    editions: n.editions.map((e) => ({
      ...sEdition(e),
      sections: e.sections.map((s) => ({ ...sSection(s), linkCount: links.find((l) => l.sectionId === s.id)?._count._all ?? 0 })),
    })),
  }));
}

export async function createNorm(ctx: Ctx, raw: unknown) {
  requireWrite(ctx);
  const input = normSchema.parse(raw);
  if (await db.norm.findFirst({ where: { organizationId: ctx.organizationId, code: input.code }, select: { id: true } })) throw dupCode("code", "Já existe uma norma com este código.");
  return db.$transaction(async (tx) => {
    const n = await tx.norm.create({ data: { ...input, organizationId: ctx.organizationId } });
    await audit(tx, ctx, "norm", n.id, "CREATE", { code: n.code });
    return sNorm(n);
  });
}
export async function updateNorm(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  const input = normSchema.parse(raw);
  const before = await loadNorm(ctx, id);
  if (input.code !== before.code && (await db.norm.findFirst({ where: { organizationId: ctx.organizationId, code: input.code }, select: { id: true } })))
    throw dupCode("code", "Já existe uma norma com este código.");
  return db.$transaction(async (tx) => {
    const n = await tx.norm.update({ where: { id }, data: input });
    const c = diff(before, n);
    if (c) await audit(tx, ctx, "norm", id, "UPDATE", c);
    return sNorm(n);
  });
}
export async function setNormStatus(ctx: Ctx, id: string, status: "ACTIVE" | "INACTIVE") {
  requireWrite(ctx);
  await loadNorm(ctx, id);
  return db.$transaction(async (tx) => {
    const n = await tx.norm.update({ where: { id }, data: { status } });
    await audit(tx, ctx, "norm", id, status === "ACTIVE" ? "REACTIVATE" : "DEACTIVATE");
    return sNorm(n);
  });
}

export async function createEdition(ctx: Ctx, normId: string, raw: unknown) {
  requireWrite(ctx);
  const input = normEditionSchema.parse(raw);
  const norm = await loadNorm(ctx, normId);
  if (norm.status !== "ACTIVE") throw conflict("INACTIVE", "A norma está inativa.");
  if (await db.normEdition.findFirst({ where: { normId, edition: input.edition }, select: { id: true } })) throw dupCode("edition", "Esta edição já está cadastrada para a norma.");
  return db.$transaction(async (tx) => {
    if (input.isCurrent) await tx.normEdition.updateMany({ where: { normId }, data: { isCurrent: false } });
    const e = await tx.normEdition.create({ data: { ...input, publishedOn: input.publishedOn ? toDate(input.publishedOn) : null, normId, organizationId: ctx.organizationId } });
    await audit(tx, ctx, "norm_edition", e.id, "CREATE", { norm: norm.code, edition: e.edition });
    return sEdition(e);
  });
}
export async function updateEdition(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  const input = normEditionSchema.parse(raw);
  const before = await loadEdition(ctx, id);
  if (input.edition !== before.edition && (await db.normEdition.findFirst({ where: { normId: before.normId, edition: input.edition }, select: { id: true } })))
    throw dupCode("edition", "Esta edição já está cadastrada para a norma.");
  return db.$transaction(async (tx) => {
    if (input.isCurrent) await tx.normEdition.updateMany({ where: { normId: before.normId, id: { not: id } }, data: { isCurrent: false } });
    const e = await tx.normEdition.update({ where: { id }, data: { ...input, publishedOn: input.publishedOn ? toDate(input.publishedOn) : null } });
    const c = diff({ ...before, publishedOn: day(before.publishedOn) }, { ...e, publishedOn: day(e.publishedOn) });
    if (c) await audit(tx, ctx, "norm_edition", id, "UPDATE", c);
    return sEdition(e);
  });
}
export async function setEditionStatus(ctx: Ctx, id: string, status: "ACTIVE" | "INACTIVE") {
  requireWrite(ctx);
  await loadEdition(ctx, id);
  return db.$transaction(async (tx) => {
    const e = await tx.normEdition.update({ where: { id }, data: { status, ...(status === "INACTIVE" ? { isCurrent: false } : {}) } });
    await audit(tx, ctx, "norm_edition", id, status === "ACTIVE" ? "REACTIVATE" : "DEACTIVATE");
    return sEdition(e);
  });
}

export async function createSection(ctx: Ctx, editionId: string, raw: unknown) {
  requireWrite(ctx);
  const input = normSectionSchema.parse(raw);
  const ed = await loadEdition(ctx, editionId);
  if (ed.status !== "ACTIVE") throw conflict("INACTIVE", "A edição está inativa.");
  if (await db.normSection.findFirst({ where: { editionId, ref: input.ref }, select: { id: true } })) throw dupCode("ref", "Esta seção já existe na edição.");
  return db.$transaction(async (tx) => {
    const max = await tx.normSection.aggregate({ where: { editionId }, _max: { sortOrder: true } });
    const s = await tx.normSection.create({ data: { ...input, editionId, organizationId: ctx.organizationId, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
    await audit(tx, ctx, "norm_section", s.id, "CREATE", { ref: s.ref });
    return sSection(s);
  });
}
export async function updateSection(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  const input = normSectionSchema.parse(raw);
  const before = await loadSection(ctx, id);
  if (input.ref !== before.ref && (await db.normSection.findFirst({ where: { editionId: before.editionId, ref: input.ref }, select: { id: true } })))
    throw dupCode("ref", "Esta seção já existe na edição.");
  return db.$transaction(async (tx) => {
    const s = await tx.normSection.update({ where: { id }, data: input });
    const c = diff(before, s);
    if (c) await audit(tx, ctx, "norm_section", id, "UPDATE", c);
    return sSection(s);
  });
}
export async function setSectionStatus(ctx: Ctx, id: string, status: "ACTIVE" | "INACTIVE") {
  requireWrite(ctx);
  await loadSection(ctx, id);
  return db.$transaction(async (tx) => {
    const s = await tx.normSection.update({ where: { id }, data: { status } });
    await audit(tx, ctx, "norm_section", id, status === "ACTIVE" ? "REACTIVATE" : "DEACTIVATE");
    return sSection(s);
  });
}

/** Seções ativas (para escolher ao vincular ao catálogo). */
export async function searchSections(ctx: Ctx, q: { q?: string } = {}) {
  const rows = await db.normSection.findMany({
    where: {
      organizationId: ctx.organizationId, status: "ACTIVE", edition: { status: "ACTIVE", norm: { status: "ACTIVE" } },
      ...(q.q ? { OR: [{ ref: { contains: q.q, mode: "insensitive" } }, { title: { contains: q.q, mode: "insensitive" } }, { edition: { norm: { code: { contains: q.q, mode: "insensitive" } } } }] } : {}),
    },
    include: { edition: { include: { norm: true } } },
    orderBy: [{ edition: { norm: { code: "asc" } } }, { sortOrder: "asc" }], take: 100,
  });
  return rows.map((s) => ({ id: s.id, ref: s.ref, title: s.title, edition: s.edition.edition, normCode: s.edition.norm.code, normTitle: s.edition.norm.title }));
}

/** Vínculos de um item do catálogo: diretos e herdados do sistema/subsistema acima. */
export async function listCatalogNorms(ctx: Ctx, itemId: string) {
  const chain = await catalogChain(db, ctx, itemId);
  const links = await db.catalogItemNormSection.findMany({
    where: { organizationId: ctx.organizationId, catalogItemId: { in: chain.map((c) => c.id) } },
    include: { section: { include: { edition: { include: { norm: true } } } } }, orderBy: { createdAt: "asc" },
  });
  return links.map((l) => ({
    id: l.id, direct: l.catalogItemId === itemId, inheritedFrom: l.catalogItemId === itemId ? null : chain.find((c) => c.id === l.catalogItemId)?.name ?? null,
    notes: l.notes, sectionId: l.sectionId, sectionRef: l.section.ref, sectionTitle: l.section.title,
    edition: l.section.edition.edition, isCurrentEdition: l.section.edition.isCurrent, normCode: l.section.edition.norm.code, normTitle: l.section.edition.norm.title,
    sectionStatus: l.section.status,
  }));
}

export async function addCatalogNormLink(ctx: Ctx, itemId: string, raw: unknown) {
  requireWrite(ctx);
  const input = normLinkSchema.parse(raw);
  const item = await loadCatalogItem(db, ctx, itemId);
  const sec = await db.normSection.findFirst({ where: { id: input.sectionId, organizationId: ctx.organizationId }, include: { edition: { include: { norm: true } } } });
  if (!sec) throw notFound("Seção");
  if (sec.status !== "ACTIVE" || sec.edition.status !== "ACTIVE" || sec.edition.norm.status !== "ACTIVE") throw conflict("INACTIVE", "A seção, a edição ou a norma está inativa.");
  if (await db.catalogItemNormSection.findUnique({ where: { catalogItemId_sectionId: { catalogItemId: itemId, sectionId: sec.id } } }))
    throw conflict("DUPLICATE", "Esta seção já está vinculada ao item.");
  return db.$transaction(async (tx) => {
    const l = await tx.catalogItemNormSection.create({ data: { organizationId: ctx.organizationId, catalogItemId: itemId, sectionId: sec.id, notes: input.notes } });
    await audit(tx, ctx, "catalog_item", itemId, "NORM_LINK", { norm: sec.edition.norm.code, edition: sec.edition.edition, section: sec.ref, item: item.code });
    return { id: l.id };
  });
}

export async function removeCatalogNormLink(ctx: Ctx, linkId: string) {
  requireWrite(ctx);
  ensureUuid(linkId, "Vínculo");
  const l = await db.catalogItemNormSection.findFirst({ where: { id: linkId, organizationId: ctx.organizationId }, include: { section: { include: { edition: { include: { norm: true } } } } } });
  if (!l) throw notFound("Vínculo");
  await db.$transaction(async (tx) => {
    await tx.catalogItemNormSection.delete({ where: { id: linkId } });
    await audit(tx, ctx, "catalog_item", l.catalogItemId, "NORM_UNLINK", { norm: l.section.edition.norm.code, edition: l.section.edition.edition, section: l.section.ref });
  });
  return { ok: true };
}

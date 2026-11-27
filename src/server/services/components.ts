import type { Component, Prisma } from "@prisma/client";
import { db } from "../db";
import type { Ctx } from "../context";
import { requireWrite } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { audit, diff } from "../audit";
import { componentQuery, componentSchema, componentUpdateSchema, toDate } from "../validation";
import { day, ts } from "../serializers";
import { ensureUuid, loadActiveProject, loadLocation, loadProject, pageArgs } from "./common";
import { catalogChain, loadCatalogItem } from "./catalog";
import { listAudit } from "./history";

type Cat = { id: string; parentId: string | null; kind: string; code: string; name: string; status: string };

async function catalogMap(ctx: Ctx) {
  const rows = await db.catalogItem.findMany({
    where: { organizationId: ctx.organizationId }, select: { id: true, parentId: true, kind: true, code: true, name: true, status: true },
  });
  return new Map<string, Cat>(rows.map((r) => [r.id, r]));
}
function chainOf(map: Map<string, Cat>, id: string) {
  const out: Cat[] = [];
  let cur = map.get(id);
  while (cur) { out.unshift(cur); cur = cur.parentId ? map.get(cur.parentId) : undefined; }
  return out;
}

async function locationPath(ctx: Ctx, locationId: string) {
  const names: string[] = [];
  let cur = await db.location.findFirst({ where: { id: locationId, organizationId: ctx.organizationId }, include: { building: { select: { name: true } } } });
  const buildingName = cur?.building?.name ?? null;
  while (cur) {
    names.unshift(cur.name);
    cur = cur.parentLocationId
      ? await db.location.findFirst({ where: { id: cur.parentLocationId, organizationId: ctx.organizationId }, include: { building: { select: { name: true } } } })
      : null;
  }
  return buildingName ? [buildingName, ...names] : names;
}

type Row = Component & { location?: { id: string; code: string; name: string; locationType: string; status: string } | null };

function serialize(c: Row, map: Map<string, Cat>, path?: string[]) {
  const chain = chainOf(map, c.typeId);
  const system = chain.find((x) => x.kind === "SYSTEM");
  const sub = chain.find((x) => x.kind === "SUBSYSTEM");
  const type = chain[chain.length - 1];
  return {
    id: c.id, publicCode: c.publicCode, projectId: c.projectId,
    type: type ? { id: type.id, code: type.code, name: type.name, status: type.status } : null,
    subsystem: sub ? { id: sub.id, code: sub.code, name: sub.name } : null,
    system: system ? { id: system.id, code: system.code, name: system.name } : null,
    location: c.location ? { id: c.location.id, code: c.location.code, name: c.location.name, locationType: c.location.locationType, status: c.location.status, path: path ?? null } : null,
    name: c.name, tag: c.tag, manufacturer: c.manufacturer, model: c.model, serialNumber: c.serialNumber,
    installedOn: day(c.installedOn), description: c.description, notes: c.notes,
    status: c.status, deactivatedAt: c.deactivatedAt ? ts(c.deactivatedAt) : null, createdAt: ts(c.createdAt), updatedAt: ts(c.updatedAt),
  };
}

const withLoc = { location: { select: { id: true, code: true, name: true, locationType: true, status: true } } } as const;

export async function listComponents(ctx: Ctx, projectId: string, rawQuery: unknown) {
  ensureUuid(projectId, "Empreendimento");
  await loadProject(db, ctx, projectId);
  const q = componentQuery.parse(rawQuery ?? {});
  const map = await catalogMap(ctx);
  const where: Prisma.ComponentWhereInput = { projectId, organizationId: ctx.organizationId };
  if (q.status === "ACTIVE" || q.status === "INACTIVE") where.status = q.status;
  else if (!q.status) where.status = "ACTIVE";
  if (q.typeId) where.typeId = q.typeId;
  if (q.locationId) where.locationId = q.locationId;
  if (q.systemId) {
    const typeIds = [...map.values()].filter((t) => t.kind === "TYPE" && chainOf(map, t.id)[0]?.id === q.systemId).map((t) => t.id);
    where.typeId = q.typeId ? (typeIds.includes(q.typeId) ? q.typeId : "00000000-0000-0000-0000-000000000000") : { in: typeIds };
  }
  if (q.q) {
    where.OR = [
      { name: { contains: q.q, mode: "insensitive" } }, { tag: { contains: q.q, mode: "insensitive" } },
      { publicCode: { contains: q.q, mode: "insensitive" } }, { serialNumber: { contains: q.q, mode: "insensitive" } },
      { manufacturer: { contains: q.q, mode: "insensitive" } },
    ];
  }
  const [total, rows] = await Promise.all([
    db.component.count({ where }),
    db.component.findMany({ where, include: withLoc, orderBy: [{ seq: "asc" }], ...pageArgs(q.page, q.pageSize) }),
  ]);
  return { total, page: q.page, pageSize: q.pageSize, items: rows.map((r) => serialize(r, map)) };
}

async function applicableNorms(ctx: Ctx, typeId: string) {
  const chain = await catalogChain(db, ctx, typeId);
  const links = await db.catalogItemNormSection.findMany({
    where: { organizationId: ctx.organizationId, catalogItemId: { in: chain.map((c) => c.id) } },
    include: { section: { include: { edition: { include: { norm: true } } } } },
  });
  return links.map((l) => ({
    linkId: l.id, inheritedFrom: l.catalogItemId === typeId ? null : chain.find((c) => c.id === l.catalogItemId)?.name ?? null,
    notes: l.notes, sectionRef: l.section.ref, sectionTitle: l.section.title,
    edition: l.section.edition.edition, normCode: l.section.edition.norm.code, normTitle: l.section.edition.norm.title,
  }));
}

export async function getComponent(ctx: Ctx, id: string) {
  ensureUuid(id, "Componente");
  const c = await db.component.findFirst({ where: { id, organizationId: ctx.organizationId }, include: withLoc });
  if (!c) throw notFound("Componente");
  const map = await catalogMap(ctx);
  const path = c.locationId ? await locationPath(ctx, c.locationId) : undefined;
  const [criteria, norms] = await Promise.all([
    db.inspectionCriterion.findMany({ where: { typeId: c.typeId, organizationId: ctx.organizationId, status: "ACTIVE" }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    applicableNorms(ctx, c.typeId),
  ]);
  return {
    ...serialize(c, map, path),
    norms,
    form: criteria.map((k) => ({ id: k.id, code: k.code, label: k.label, responseType: k.responseType, required: k.required, unit: k.unit, options: k.options })),
  };
}

async function validateLocation(ctx: Ctx, projectId: string, locationId: string | null, current?: string | null) {
  if (!locationId) return;
  const l = await loadLocation(db, ctx, locationId).catch(() => null);
  if (!l || l.projectId !== projectId) throw invalid("A localização deve pertencer ao mesmo empreendimento.", { locationId: "Localização inválida para este empreendimento." });
  if (l.status !== "ACTIVE" && locationId !== current) throw conflict("INACTIVE", "A localização selecionada está inativa.", { fields: { locationId: "Localização inativa." } });
}

async function assertTagFree(projectId: string, tag: string | null, exceptId?: string) {
  if (!tag) return;
  const dup = await db.component.findFirst({ where: { projectId, tag, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (dup) throw conflict("DUPLICATE_TAG", "Já existe um componente com esta plaqueta no empreendimento.", { fields: { tag: "Plaqueta já utilizada neste empreendimento." } });
}

/** RF-012/RF-014/RF-015: o identificador (CMP-000001) é gerado pelo banco e nunca muda. */
export async function createComponent(ctx: Ctx, projectId: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(projectId, "Empreendimento");
  const input = componentSchema.parse(raw);
  await loadActiveProject(db, ctx, projectId);
  const type = await loadCatalogItem(db, ctx, input.typeId);
  if (type.kind !== "TYPE") throw invalid("Selecione um tipo de componente.", { typeId: "Escolha um tipo de componente do catálogo." });
  if (type.status !== "ACTIVE") throw conflict("INACTIVE", "Este tipo está inativo no catálogo e não aceita novos componentes.", { fields: { typeId: "Tipo inativo." } });
  const sysId = (await catalogChain(db, ctx, type.id))[0].id;
  const sel = await db.projectSystem.findUnique({ where: { projectId_systemId: { projectId, systemId: sysId } } });
  if (!sel || sel.status !== "ACTIVE")
    throw conflict("SYSTEM_NOT_SELECTED", "O sistema deste tipo não está selecionado no empreendimento. Selecione-o na aba Sistemas.", { fields: { typeId: "Sistema não selecionado no empreendimento." } });
  await validateLocation(ctx, projectId, input.locationId);
  await assertTagFree(projectId, input.tag);
  const { installedOn, ...rest } = input;
  return db.$transaction(async (tx) => {
    const c = await tx.component.create({
      data: { ...rest, installedOn: installedOn ? toDate(installedOn) : null, projectId, organizationId: ctx.organizationId },
      include: withLoc,
    });
    await audit(tx, ctx, "component", c.id, "CREATE", { publicCode: c.publicCode, type: type.code, locationId: c.locationId });
    return serialize(c, await catalogMap(ctx));
  });
}

export async function updateComponent(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(id, "Componente");
  const input = componentUpdateSchema.parse(raw);
  const before = await db.component.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!before) throw notFound("Componente");
  await loadActiveProject(db, ctx, before.projectId);
  if (before.status !== "ACTIVE") throw conflict("INACTIVE", "Componente inativo. Reative-o para editar.");
  await validateLocation(ctx, before.projectId, input.locationId, before.locationId);
  if (input.tag !== before.tag) await assertTagFree(before.projectId, input.tag, id);
  const { installedOn, ...rest } = input;
  return db.$transaction(async (tx) => {
    const c = await tx.component.update({ where: { id }, data: { ...rest, installedOn: installedOn ? toDate(installedOn) : null }, include: withLoc });
    const changes = diff({ ...before, installedOn: day(before.installedOn) }, { ...c, installedOn: day(c.installedOn) });
    if (changes) await audit(tx, ctx, "component", id, "UPDATE", changes);
    return serialize(c, await catalogMap(ctx));
  });
}

export async function deactivateComponent(ctx: Ctx, id: string) {
  requireWrite(ctx);
  ensureUuid(id, "Componente");
  const before = await db.component.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!before) throw notFound("Componente");
  return db.$transaction(async (tx) => {
    const c = await tx.component.update({ where: { id }, data: { status: "INACTIVE", deactivatedAt: before.deactivatedAt ?? new Date() }, include: withLoc });
    if (before.status !== "INACTIVE") await audit(tx, ctx, "component", id, "DEACTIVATE");
    return serialize(c, await catalogMap(ctx));
  });
}

export async function reactivateComponent(ctx: Ctx, id: string) {
  requireWrite(ctx);
  ensureUuid(id, "Componente");
  const before = await db.component.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { type: true } });
  if (!before) throw notFound("Componente");
  await loadActiveProject(db, ctx, before.projectId);
  if (before.type.status !== "ACTIVE") throw conflict("INACTIVE", "O tipo deste componente está inativo no catálogo. Reative o tipo primeiro.");
  return db.$transaction(async (tx) => {
    const c = await tx.component.update({ where: { id }, data: { status: "ACTIVE", deactivatedAt: null }, include: withLoc });
    await audit(tx, ctx, "component", id, "REACTIVATE");
    return serialize(c, await catalogMap(ctx));
  });
}

/**
 * RF-022 (parcial): hoje reúne as alterações de cadastro do componente. Registros de inspeção e
 * ocorrências (RF-035/RF-037) serão acrescentados quando esses módulos existirem.
 */
export async function componentHistory(ctx: Ctx, id: string) {
  ensureUuid(id, "Componente");
  const c = await db.component.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
  if (!c) throw notFound("Componente");
  return { items: await listAudit(ctx, "component", id), sources: { cadastro: true, inspecoes: false, ocorrencias: false } };
}

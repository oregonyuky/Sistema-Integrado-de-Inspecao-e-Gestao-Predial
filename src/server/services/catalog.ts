import type { CatalogItem, CatalogItemKind } from "@prisma/client";
import { db } from "../db";
import type { Ctx } from "../context";
import { requireAdmin, requireWrite } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { audit, diff } from "../audit";
import { catalogItemSchema, catalogItemUpdateSchema } from "../validation";
import { day, ts } from "../serializers";
import { ensureUuid, type Db } from "./common";

export const KIND_LABEL: Record<CatalogItemKind, string> = { SYSTEM: "sistema", SUBSYSTEM: "subsistema", TYPE: "tipo de componente" };

export function serializeCatalogItem(i: CatalogItem) {
  return {
    id: i.id, parentId: i.parentId, kind: i.kind, code: i.code, name: i.name, description: i.description,
    sortOrder: i.sortOrder, status: i.status, createdAt: ts(i.createdAt), updatedAt: ts(i.updatedAt),
  };
}

export async function loadCatalogItem(d: Db, ctx: Ctx, id: string) {
  ensureUuid(id, "Item do catálogo");
  const i = await d.catalogItem.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!i) throw notFound("Item do catálogo");
  return i;
}

/** Cadeia do item até o sistema (do mais alto para o próprio item). */
export async function catalogChain(d: Db, ctx: Ctx, id: string) {
  const chain: CatalogItem[] = [];
  let cur: CatalogItem | null = await loadCatalogItem(d, ctx, id);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parentId ? await d.catalogItem.findFirst({ where: { id: cur.parentId, organizationId: ctx.organizationId } }) : null;
  }
  return chain;
}

export async function systemIdOf(d: Db, ctx: Ctx, id: string) {
  return (await catalogChain(d, ctx, id))[0].id;
}

function checkParent(kind: CatalogItemKind, parent: CatalogItem | null) {
  if (kind === "SYSTEM") {
    if (parent) throw invalid("Um sistema não pode estar dentro de outro item.", { parentId: "Sistemas ficam na raiz do catálogo." });
    return;
  }
  if (!parent) throw invalid("Selecione o item superior.", { parentId: "Campo obrigatório." });
  if (parent.status !== "ACTIVE") throw conflict("INACTIVE", "O item superior está inativo. Reative-o antes de adicionar itens dentro dele.");
  if (kind === "SUBSYSTEM" && parent.kind !== "SYSTEM") throw invalid("Um subsistema só pode estar dentro de um sistema.", { parentId: "Escolha um sistema." });
  if (kind === "TYPE" && parent.kind === "TYPE") throw invalid("Um tipo de componente só pode estar dentro de um sistema ou subsistema.", { parentId: "Escolha um sistema ou subsistema." });
}

async function assertCodeFree(ctx: Ctx, code: string, exceptId?: string) {
  const dup = await db.catalogItem.findFirst({
    where: { organizationId: ctx.organizationId, code, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true },
  });
  if (dup) throw conflict("DUPLICATE_CODE", "Já existe um item no catálogo com este código.", { fields: { code: "Código já utilizado no catálogo." } });
}

/** Itens do catálogo da organização, com contagens para a árvore (RF-011/RF-013). */
export async function listCatalog(ctx: Ctx, q: { status?: string } = {}) {
  const where: Record<string, unknown> = { organizationId: ctx.organizationId };
  if (q.status === "ACTIVE" || q.status === "INACTIVE") where.status = q.status;
  const items = await db.catalogItem.findMany({ where, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
  const [comp, crit, norms] = await Promise.all([
    db.component.groupBy({ by: ["typeId"], where: { organizationId: ctx.organizationId, status: "ACTIVE" }, _count: { _all: true } }),
    db.inspectionCriterion.groupBy({ by: ["typeId"], where: { organizationId: ctx.organizationId, status: "ACTIVE" }, _count: { _all: true } }),
    db.catalogItemNormSection.groupBy({ by: ["catalogItemId"], where: { organizationId: ctx.organizationId }, _count: { _all: true } }),
  ]);
  return {
    items: items.map((i) => ({
      ...serializeCatalogItem(i),
      componentCount: comp.find((c) => c.typeId === i.id)?._count._all ?? 0,
      criteriaCount: crit.find((c) => c.typeId === i.id)?._count._all ?? 0,
      normCount: norms.find((c) => c.catalogItemId === i.id)?._count._all ?? 0,
    })),
  };
}

export async function getCatalogItem(ctx: Ctx, id: string) {
  const item = await loadCatalogItem(db, ctx, id);
  const chain = await catalogChain(db, ctx, id);
  const [children, components] = await Promise.all([
    db.catalogItem.count({ where: { parentId: id } }),
    item.kind === "TYPE" ? db.component.count({ where: { typeId: id, status: "ACTIVE" } }) : Promise.resolve(0),
  ]);
  return {
    ...serializeCatalogItem(item),
    path: chain.map((c) => ({ id: c.id, kind: c.kind, code: c.code, name: c.name })),
    childCount: children,
    activeComponentCount: components,
  };
}

export async function createCatalogItem(ctx: Ctx, raw: unknown) {
  requireWrite(ctx);
  const input = catalogItemSchema.parse(raw);
  const parent = input.parentId ? await loadCatalogItem(db, ctx, input.parentId) : null;
  checkParent(input.kind, parent);
  await assertCodeFree(ctx, input.code);
  return db.$transaction(async (tx) => {
    const max = await tx.catalogItem.aggregate({ where: { organizationId: ctx.organizationId, parentId: input.parentId }, _max: { sortOrder: true } });
    const i = await tx.catalogItem.create({ data: { ...input, organizationId: ctx.organizationId, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
    await audit(tx, ctx, "catalog_item", i.id, "CREATE", { kind: i.kind, code: i.code });
    return serializeCatalogItem(i);
  });
}

/** Edita preservando o id (e, portanto, todas as referências). Permite mover para outro pai válido. */
export async function updateCatalogItem(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  const input = catalogItemUpdateSchema.parse(raw);
  const before = await loadCatalogItem(db, ctx, id);
  if (input.parentId !== before.parentId) {
    const parent = input.parentId ? await loadCatalogItem(db, ctx, input.parentId) : null;
    checkParent(before.kind, parent);
    if (parent && (await catalogChain(db, ctx, parent.id)).some((c) => c.id === id))
      throw invalid("Não é possível mover um item para dentro dele mesmo.", { parentId: "Destino inválido." });
  }
  if (input.code !== before.code) await assertCodeFree(ctx, input.code, id);
  return db.$transaction(async (tx) => {
    const i = await tx.catalogItem.update({ where: { id }, data: input });
    const changes = diff(before, i);
    if (changes) await audit(tx, ctx, "catalog_item", id, "UPDATE", changes);
    return serializeCatalogItem(i);
  });
}

async function descendantIds(d: Db, ctx: Ctx, id: string): Promise<string[]> {
  const out: string[] = [];
  let level = [id];
  while (level.length) {
    const kids = await d.catalogItem.findMany({ where: { organizationId: ctx.organizationId, parentId: { in: level } }, select: { id: true } });
    level = kids.map((k) => k.id);
    out.push(...level);
  }
  return out;
}

/**
 * Desativação lógica (RF-017): o item e o que está dentro dele deixam de aparecer para novos
 * cadastros. Componentes, critérios e vínculos já existentes são preservados e continuam consultáveis.
 */
export async function deactivateCatalogItem(ctx: Ctx, id: string) {
  requireAdmin(ctx);
  const before = await loadCatalogItem(db, ctx, id);
  return db.$transaction(async (tx) => {
    const ids = [id, ...(await descendantIds(tx, ctx, id))];
    const { count } = await tx.catalogItem.updateMany({ where: { id: { in: ids }, status: "ACTIVE" }, data: { status: "INACTIVE" } });
    const comps = await tx.component.count({
      where: { organizationId: ctx.organizationId, status: "ACTIVE", typeId: { in: ids } },
    });
    if (count > 0 || before.status !== "INACTIVE") await audit(tx, ctx, "catalog_item", id, "DEACTIVATE", { itemsDeactivated: count });
    const after = await tx.catalogItem.findUniqueOrThrow({ where: { id } });
    return { ...serializeCatalogItem(after), itemsDeactivated: count, activeComponentsKept: comps };
  });
}

export async function reactivateCatalogItem(ctx: Ctx, id: string, opts: { includeDescendants?: boolean } = {}) {
  requireAdmin(ctx);
  const before = await loadCatalogItem(db, ctx, id);
  if (before.parentId) {
    const p = await loadCatalogItem(db, ctx, before.parentId);
    if (p.status !== "ACTIVE") throw conflict("INACTIVE", "O item superior está inativo. Reative-o primeiro.");
  }
  return db.$transaction(async (tx) => {
    const ids = opts.includeDescendants ? [id, ...(await descendantIds(tx, ctx, id))] : [id];
    const { count } = await tx.catalogItem.updateMany({ where: { id: { in: ids }, status: "INACTIVE" }, data: { status: "ACTIVE" } });
    await audit(tx, ctx, "catalog_item", id, "REACTIVATE", { itemsReactivated: count });
    return { ...serializeCatalogItem(await tx.catalogItem.findUniqueOrThrow({ where: { id } })), itemsReactivated: count };
  });
}

export { day };

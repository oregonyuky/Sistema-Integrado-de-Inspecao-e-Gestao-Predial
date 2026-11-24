import { db, Prisma, type Tx } from "../db";
import type { Ctx } from "../context";
import { requireWrite } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { audit, diff } from "../audit";
import {
  locationCreateSchema,
  locationMoveSchema,
  locationSearchQuery,
  locationUpdateSchema,
  reorderSchema,
  unitListQuery,
} from "../validation";
import { serializeBuilding, serializeLocation } from "../serializers";
import { ensureUuid, loadActiveProject, loadLocation, loadProject, type Db } from "./common";

const include = { privateUnit: true } as const;

// ───────────────────────── helpers ─────────────────────────

/** Escopo de unicidade do código: o bloco, ou o empreendimento para áreas sem bloco. */
const scopeOf = (projectId: string, buildingId: string | null) => buildingId ?? projectId;

async function assertCodeFree(db_: Db, projectId: string, buildingId: string | null, code: string, exceptId?: string) {
  const dup = await db_.location.findFirst({
    where: { projectId, codeScopeId: scopeOf(projectId, buildingId), code, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (dup)
    throw conflict(
      "DUPLICATE_CODE",
      buildingId ? "Já existe uma localização com este código nesta edificação." : "Já existe uma localização com este código nas áreas sem edificação.",
      { fields: { code: "Código já utilizado neste local." } },
    );
}

async function nextSort(db_: Db, projectId: string, buildingId: string | null, parentId: string | null) {
  const max = await db_.location.aggregate({
    where: { projectId, buildingId, parentLocationId: parentId },
    _max: { sortOrder: true },
  });
  return (max._max.sortOrder ?? -1) + 1;
}

type SubNode = { id: string; parentLocationId: string | null; code: string; status: "ACTIVE" | "INACTIVE" };

/** Descendentes (inclui a raiz), em ordem de profundidade (pais antes dos filhos). */
async function collectSubtree(db_: Db, ctx: Ctx, rootId: string): Promise<{ levels: SubNode[][]; all: SubNode[] }> {
  const root = await db_.location.findFirst({
    where: { id: rootId, organizationId: ctx.organizationId },
    select: { id: true, parentLocationId: true, code: true, status: true },
  });
  if (!root) throw notFound("Localização");
  const levels: SubNode[][] = [[root]];
  const seen = new Set([root.id]);
  for (let guard = 0; guard < 100; guard++) {
    const parents = levels[levels.length - 1].map((n) => n.id);
    const kids = await db_.location.findMany({
      where: { parentLocationId: { in: parents }, organizationId: ctx.organizationId },
      select: { id: true, parentLocationId: true, code: true, status: true },
    });
    const fresh = kids.filter((k) => !seen.has(k.id));
    if (!fresh.length) break;
    fresh.forEach((k) => seen.add(k.id));
    levels.push(fresh);
  }
  return { levels, all: levels.flat() };
}

// ───────────────────────── leitura ─────────────────────────

/** Árvore do empreendimento: edificações + localizações (planas; o cliente monta a hierarquia). */
export async function getTree(ctx: Ctx, projectId: string) {
  ensureUuid(projectId, "Empreendimento");
  const project = await loadProject(db, ctx, projectId);
  const [buildings, locations] = await Promise.all([
    db.building.findMany({ where: { projectId, organizationId: ctx.organizationId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.location.findMany({
      where: { projectId, organizationId: ctx.organizationId },
      include,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  return {
    project: { id: project.id, code: project.code, name: project.name, status: project.status },
    buildings: buildings.map(serializeBuilding),
    locations: locations.map(serializeLocation),
  };
}

export async function searchLocations(ctx: Ctx, projectId: string, rawQuery: unknown) {
  ensureUuid(projectId, "Empreendimento");
  await loadProject(db, ctx, projectId);
  const q = locationSearchQuery.parse(rawQuery ?? {});
  const where: Prisma.LocationWhereInput = { projectId, organizationId: ctx.organizationId };
  if (q.type) where.locationType = q.type;
  if (q.areaClass) where.areaClass = q.areaClass;
  if (q.status && q.status !== "ALL") where.status = q.status;
  if (q.q) where.OR = [{ name: { contains: q.q, mode: "insensitive" } }, { code: { contains: q.q, mode: "insensitive" } }];
  const rows = await db.location.findMany({ where, include, orderBy: [{ name: "asc" }], take: 200 });
  return rows.map(serializeLocation);
}

export async function getLocation(ctx: Ctx, id: string) {
  ensureUuid(id, "Localização");
  const l = await loadLocation(db, ctx, id);
  const path: { id: string; code: string; name: string; locationType: string }[] = [];
  let cur = l.parentLocationId;
  for (let i = 0; cur && i < 100; i++) {
    const p = await db.location.findFirst({ where: { id: cur, organizationId: ctx.organizationId }, select: { id: true, code: true, name: true, locationType: true, parentLocationId: true } });
    if (!p) break;
    path.unshift({ id: p.id, code: p.code, name: p.name, locationType: p.locationType });
    cur = p.parentLocationId;
  }
  const building = l.buildingId ? await db.building.findFirst({ where: { id: l.buildingId } }) : null;
  const childCount = await db.location.count({ where: { parentLocationId: id } });
  return { ...serializeLocation(l), path, building: building ? serializeBuilding(building) : null, childCount };
}

/** RF-008: consulta de unidades privativas (com bloco e pavimento de cada uma). */
export async function listUnits(ctx: Ctx, projectId: string, rawQuery: unknown) {
  ensureUuid(projectId, "Empreendimento");
  await loadProject(db, ctx, projectId);
  const q = unitListQuery.parse(rawQuery ?? {});
  const where: Prisma.LocationWhereInput = { projectId, organizationId: ctx.organizationId, locationType: "UNIT" };
  if (q.status && q.status !== "ALL") where.status = q.status;
  if (q.unitType) where.privateUnit = { unitType: q.unitType };
  if (q.q) where.OR = [{ name: { contains: q.q, mode: "insensitive" } }, { code: { contains: q.q, mode: "insensitive" } }];
  const [rows, buildings] = await Promise.all([
    db.location.findMany({ where, include: { privateUnit: true, parent: { select: { id: true, name: true, locationType: true } } }, orderBy: [{ code: "asc" }] }),
    db.building.findMany({ where: { projectId, organizationId: ctx.organizationId }, select: { id: true, code: true, name: true } }),
  ]);
  return rows.map((l) => ({
    ...serializeLocation(l),
    building: buildings.find((b) => b.id === l.buildingId) ?? null,
    floor: l.parent && l.parent.locationType === "FLOOR" ? { id: l.parent.id, name: l.parent.name } : null,
  }));
}

// ───────────────────────── escrita ─────────────────────────

export async function createLocation(ctx: Ctx, projectId: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(projectId, "Empreendimento");
  const input = locationCreateSchema.parse(raw);
  await loadActiveProject(db, ctx, projectId);

  // Resolve bloco e pai (sempre dentro do mesmo empreendimento e organização).
  let buildingId = input.buildingId;
  const parentId = input.parentLocationId;

  if (parentId) {
    const parent = await db.location.findFirst({ where: { id: parentId, projectId, organizationId: ctx.organizationId } });
    if (!parent) throw invalid("A localização superior não pertence a este empreendimento.", { parentLocationId: "Localização superior inválida." });
    if (parent.status !== "ACTIVE") throw conflict("PARENT_INACTIVE", "A localização superior está inativa.");
    if (input.buildingId && input.buildingId !== parent.buildingId)
      throw invalid("O bloco informado difere do bloco da localização superior.", { buildingId: "Bloco incompatível com a localização superior." });
    buildingId = parent.buildingId; // herda o bloco do pai
  } else if (buildingId) {
    const b = await db.building.findFirst({ where: { id: buildingId, projectId, organizationId: ctx.organizationId } });
    if (!b) throw invalid("A edificação não pertence a este empreendimento.", { buildingId: "Edificação inválida." });
    if (b.status !== "ACTIVE") throw conflict("BUILDING_INACTIVE", "A edificação está inativa.");
  }

  if (input.locationType === "FLOOR") {
    if (!buildingId) throw invalid("Pavimentos devem pertencer a uma edificação.", { buildingId: "Selecione a edificação." });
    if (parentId) throw invalid("Pavimentos são o primeiro nível de uma edificação.", { parentLocationId: "Pavimento não pode ter localização superior." });
  }
  if (input.locationType === "UNIT" && !input.unit)
    throw invalid("Informe os dados da unidade privativa.", { "unit.unitType": "Selecione o tipo de unidade." });
  if (input.locationType !== "UNIT" && input.unit)
    throw invalid("Dados de unidade só se aplicam ao tipo Unidade privativa.", { locationType: "Tipo incompatível." });

  await assertCodeFree(db, projectId, buildingId, input.code);

  const isFloor = input.locationType === "FLOOR";
  const isUnit = input.locationType === "UNIT";
  const created = await db.$transaction(async (tx) => {
    const loc = await tx.location.create({
      data: {
        organizationId: ctx.organizationId,
        projectId,
        buildingId,
        parentLocationId: parentId,
        code: input.code,
        name: input.name,
        locationType: input.locationType,
        areaClass: isUnit ? "PRIVATE" : (input.areaClass ?? "UNDEFINED"),
        floorKind: isFloor ? input.floorKind : null,
        floorOrder: isFloor ? input.floorOrder : null,
        elevationM: isFloor ? input.elevationM : null,
        areaM2: input.areaM2,
        description: input.description,
        sortOrder: await nextSort(tx, projectId, buildingId, parentId),
      },
    });
    if (isUnit && input.unit) {
      await tx.privateUnit.create({
        data: { organizationId: ctx.organizationId, projectId, locationId: loc.id, unitType: input.unit.unitType, privateAreaM2: input.unit.privateAreaM2 },
      });
    }
    await audit(tx, ctx, "location", loc.id, "CREATE", { type: loc.locationType, code: loc.code });
    return loc.id;
  });
  return serializeLocation(await loadLocation(db, ctx, created));
}

export async function updateLocation(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(id, "Localização");
  const input = locationUpdateSchema.parse(raw);
  const before = await loadLocation(db, ctx, id);

  if (input.locationType && input.locationType !== before.locationType) {
    if (before.locationType === "FLOOR" || before.locationType === "UNIT" || input.locationType === "FLOOR" || input.locationType === "UNIT")
      throw invalid("Pavimentos e unidades não podem mudar de tipo. Cadastre um novo elemento.", { locationType: "Alteração de tipo não permitida." });
  }
  if (input.code && input.code !== before.code) await assertCodeFree(db, before.projectId, before.buildingId, input.code, id);

  const type = input.locationType ?? before.locationType;
  const isFloor = type === "FLOOR";
  const isUnit = type === "UNIT";

  const data: Prisma.LocationUpdateInput = {};
  if (input.code !== undefined) data.code = input.code;
  if (input.name !== undefined) data.name = input.name;
  if (input.locationType !== undefined) data.locationType = input.locationType;
  if (input.areaM2 !== undefined) data.areaM2 = input.areaM2;
  if (input.description !== undefined) data.description = input.description;
  if (isUnit) data.areaClass = "PRIVATE";
  else if (input.areaClass !== undefined) data.areaClass = input.areaClass;
  if (isFloor) {
    if (input.floorKind !== undefined) data.floorKind = input.floorKind;
    if (input.floorOrder !== undefined) data.floorOrder = input.floorOrder;
    if (input.elevationM !== undefined) data.elevationM = input.elevationM;
  }

  await db.$transaction(async (tx) => {
    const l = await tx.location.update({ where: { id }, data });
    const changes = diff(before, l) ?? {};
    if (isUnit && input.unit) {
      const u = await tx.privateUnit.update({ where: { locationId: id }, data: { unitType: input.unit.unitType, privateAreaM2: input.unit.privateAreaM2 } });
      const uc = diff(before.privateUnit ?? {}, u);
      if (uc) changes.unit = { changed: true, fields: Object.keys(uc) } as never;
    }
    if (Object.keys(changes).length) await audit(tx, ctx, "location", id, "UPDATE", changes);
  });
  return serializeLocation(await loadLocation(db, ctx, id));
}

/**
 * Move um elemento (e toda a sua subárvore) para outro pai/bloco do MESMO empreendimento.
 * Impede ciclos, valida códigos no destino e mantém o bloco coerente em toda a subárvore.
 */
export async function moveLocation(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(id, "Localização");
  const input = locationMoveSchema.parse(raw);
  const loc = await loadLocation(db, ctx, id);
  const projectId = loc.projectId;

  let newBuildingId: string | null;
  const newParentId = input.parentLocationId;

  const { levels, all } = await collectSubtree(db, ctx, id);

  if (newParentId) {
    if (all.some((n) => n.id === newParentId))
      throw conflict("CYCLE", "Não é possível mover um elemento para dentro dele mesmo ou de um de seus descendentes.");
    const parent = await db.location.findFirst({ where: { id: newParentId, projectId, organizationId: ctx.organizationId } });
    if (!parent) throw invalid("O destino não pertence a este empreendimento.", { parentLocationId: "Destino inválido." });
    if (parent.status !== "ACTIVE") throw conflict("PARENT_INACTIVE", "O destino está inativo.");
    newBuildingId = parent.buildingId;
  } else {
    newBuildingId = input.buildingId ?? null;
    if (newBuildingId) {
      const b = await db.building.findFirst({ where: { id: newBuildingId, projectId, organizationId: ctx.organizationId } });
      if (!b) throw invalid("A edificação não pertence a este empreendimento.", { buildingId: "Edificação inválida." });
      if (b.status !== "ACTIVE") throw conflict("BUILDING_INACTIVE", "A edificação de destino está inativa.");
    }
  }

  if (loc.locationType === "FLOOR") {
    if (newParentId || !newBuildingId) throw invalid("Pavimentos só podem ser movidos para a raiz de outra edificação.", { parentLocationId: "Destino inválido para pavimento." });
  }

  const buildingChanged = newBuildingId !== loc.buildingId;
  const parentChanged = newParentId !== loc.parentLocationId;
  if (!buildingChanged && !parentChanged) return serializeLocation(loc);

  if (buildingChanged) {
    const codes = all.map((n) => n.code);
    const clash = await db.location.findFirst({
      where: { projectId, codeScopeId: scopeOf(projectId, newBuildingId), code: { in: codes }, id: { notIn: all.map((n) => n.id) } },
      select: { code: true },
    });
    if (clash) throw conflict("DUPLICATE_CODE", `O código ${clash.code} já existe no destino. Renomeie o código antes de mover.`);
  }

  const sort = await nextSort(db, projectId, newBuildingId, newParentId);
  await db.$transaction(async (tx) => {
    // Topo da subárvore primeiro; depois cada nível (o trigger exige pai e filho no mesmo bloco).
    await tx.location.update({ where: { id }, data: { parentLocationId: newParentId, buildingId: newBuildingId, sortOrder: sort } });
    if (buildingChanged) {
      for (const level of levels.slice(1)) {
        await tx.location.updateMany({ where: { id: { in: level.map((n) => n.id) } }, data: { buildingId: newBuildingId } });
      }
    }
    await audit(tx, ctx, "location", id, "MOVE", {
      from: { parentLocationId: loc.parentLocationId, buildingId: loc.buildingId },
      to: { parentLocationId: newParentId, buildingId: newBuildingId },
      descendants: all.length - 1,
    });
  });
  return serializeLocation(await loadLocation(db, ctx, id));
}

/** Desativação lógica do elemento e de todos os seus descendentes (nada é excluído). */
export async function deactivateLocation(ctx: Ctx, id: string) {
  requireWrite(ctx);
  ensureUuid(id, "Localização");
  await loadLocation(db, ctx, id);
  const { all } = await collectSubtree(db, ctx, id);
  const ids = all.filter((n) => n.status === "ACTIVE").map((n) => n.id);
  await db.$transaction(async (tx) => {
    if (ids.length) await tx.location.updateMany({ where: { id: { in: ids }, organizationId: ctx.organizationId }, data: { status: "INACTIVE" } });
    await audit(tx, ctx, "location", id, "DEACTIVATE", { affected: ids.length });
  });
  return { affected: ids.length, location: serializeLocation(await loadLocation(db, ctx, id)) };
}

export async function reactivateLocation(ctx: Ctx, id: string, opts: { includeDescendants?: boolean } = {}) {
  requireWrite(ctx);
  ensureUuid(id, "Localização");
  const loc = await loadLocation(db, ctx, id);
  if (loc.parentLocationId) {
    const parent = await db.location.findUnique({ where: { id: loc.parentLocationId }, select: { status: true } });
    if (parent?.status !== "ACTIVE") throw conflict("PARENT_INACTIVE", "Reative primeiro a localização superior.");
  }
  if (loc.buildingId) {
    const b = await db.building.findUnique({ where: { id: loc.buildingId }, select: { status: true } });
    if (b?.status !== "ACTIVE") throw conflict("BUILDING_INACTIVE", "Reative primeiro a edificação.");
  }
  const { all } = await collectSubtree(db, ctx, id);
  const ids = opts.includeDescendants ? all.filter((n) => n.status === "INACTIVE").map((n) => n.id) : [id];
  await db.$transaction(async (tx) => {
    await tx.location.updateMany({ where: { id: { in: ids }, organizationId: ctx.organizationId }, data: { status: "ACTIVE" } });
    await audit(tx, ctx, "location", id, "REACTIVATE", { affected: ids.length });
  });
  return { affected: ids.length, location: serializeLocation(await loadLocation(db, ctx, id)) };
}

/** Exclusão física: somente para elementos sem filhos (ex.: cadastro feito por engano). */
export async function deleteLocation(ctx: Ctx, id: string) {
  requireWrite(ctx);
  ensureUuid(id, "Localização");
  const loc = await loadLocation(db, ctx, id);
  const children = await db.location.count({ where: { parentLocationId: id } });
  if (children > 0)
    throw conflict("HAS_RELATED_RECORDS", `Não é possível excluir: existem ${children} elemento(s) abaixo deste. Desative-o para preservar o histórico.`);
  await db.$transaction(async (tx) => {
    if (loc.privateUnit) await tx.privateUnit.delete({ where: { locationId: id } });
    await tx.location.delete({ where: { id } });
    await audit(tx, ctx, "location", id, "DELETE", { code: loc.code, name: loc.name, type: loc.locationType });
  });
  return { ok: true };
}

/** Sobe/desce o elemento entre irmãos. Pavimentos usam o campo "ordem do pavimento". */
export async function reorderLocation(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(id, "Localização");
  const { direction } = reorderSchema.parse(raw);
  const loc = await loadLocation(db, ctx, id);
  if (loc.locationType === "FLOOR")
    throw invalid("A ordem dos pavimentos é definida pelo campo “Ordem do pavimento”.", { floorOrder: "Edite a ordem do pavimento." });
  await db.$transaction(async (tx: Tx) => {
    const siblings = await tx.location.findMany({
      where: {
        projectId: loc.projectId,
        organizationId: ctx.organizationId,
        buildingId: loc.buildingId,
        parentLocationId: loc.parentLocationId,
        NOT: { locationType: "FLOOR" },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true },
    });
    const i = siblings.findIndex((s) => s.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= siblings.length) return;
    [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
    for (let k = 0; k < siblings.length; k++) await tx.location.update({ where: { id: siblings[k].id }, data: { sortOrder: k } });
  });
  return { ok: true };
}

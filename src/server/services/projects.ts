import { db, Prisma } from "../db";
import type { Ctx } from "../context";
import { requireAdmin, requireWrite } from "../context";
import { conflict, notFound } from "../errors";
import { audit, diff } from "../audit";
import { projectListQuery, projectSchema, characteristicsSchema } from "../validation";
import { serializeAssignment, serializeCharacteristics, serializeProject, ts } from "../serializers";
import { currentYear, todayISO } from "@/lib/dates";
import { ensureUuid, loadProject, pageArgs } from "./common";

export async function listProjects(ctx: Ctx, rawQuery: unknown) {
  const q = projectListQuery.parse(rawQuery ?? {});
  const where: Prisma.ProjectWhereInput = { organizationId: ctx.organizationId };
  if (q.status && q.status !== "ALL") where.status = q.status;
  if (q.clientId) where.clientId = q.clientId;
  if (q.projectType) where.projectType = q.projectType;
  if (q.q) {
    where.OR = [
      { name: { contains: q.q, mode: "insensitive" } },
      { code: { contains: q.q, mode: "insensitive" } },
      { city: { contains: q.q, mode: "insensitive" } },
    ];
  }
  const [total, rows] = await Promise.all([
    db.project.count({ where }),
    db.project.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      include: { client: { select: { id: true, name: true, status: true } } },
      ...pageArgs(q.page, q.pageSize),
    }),
  ]);
  return {
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: rows.map((p) => ({ ...serializeProject(p), client: p.client })),
  };
}

export async function getProject(ctx: Ctx, id: string) {
  ensureUuid(id, "Empreendimento");
  const p = await db.project.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { client: { select: { id: true, name: true, status: true } }, characteristics: true },
  });
  if (!p) throw notFound("Empreendimento");
  return {
    ...serializeProject(p),
    client: p.client,
    characteristics: serializeCharacteristics(p.characteristics, currentYear()),
  };
}

async function assertClientUsable(ctx: Ctx, clientId: string, currentClientId?: string) {
  const client = await db.client.findFirst({ where: { id: clientId, organizationId: ctx.organizationId } });
  if (!client) throw notFound("Cliente");
  if (client.status !== "ACTIVE" && clientId !== currentClientId)
    throw conflict("CLIENT_INACTIVE", "O cliente está inativo. Reative-o ou escolha outro cliente.");
}

async function assertCodeFree(ctx: Ctx, code: string, exceptId?: string) {
  const dup = await db.project.findFirst({
    where: { organizationId: ctx.organizationId, code, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (dup) throw conflict("DUPLICATE_CODE", "Já existe um empreendimento com este código.", { fields: { code: "Código já utilizado." } });
}

export async function createProject(ctx: Ctx, raw: unknown) {
  requireWrite(ctx);
  const { characteristics, ...input } = projectSchema.parse(raw);
  await assertClientUsable(ctx, input.clientId);
  await assertCodeFree(ctx, input.code);
  const id = await db.$transaction(async (tx) => {
    const p = await tx.project.create({ data: { ...input, organizationId: ctx.organizationId } });
    if (characteristics) {
      await tx.projectCharacteristics.create({ data: { ...characteristics, projectId: p.id, organizationId: ctx.organizationId } });
    }
    await audit(tx, ctx, "project", p.id, "CREATE");
    return p.id;
  });
  return getProject(ctx, id);
}

export async function updateProject(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(id, "Empreendimento");
  const { characteristics, ...input } = projectSchema.parse(raw);
  const before = await db.project.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { characteristics: true },
  });
  if (!before) throw notFound("Empreendimento");
  if (input.clientId !== before.clientId) await assertClientUsable(ctx, input.clientId, before.clientId);
  if (input.code !== before.code) await assertCodeFree(ctx, input.code, id);

  await db.$transaction(async (tx) => {
    const p = await tx.project.update({ where: { id }, data: input });
    const changes = diff(before, p) ?? {};
    if (characteristics) {
      const c = await tx.projectCharacteristics.upsert({
        where: { projectId: id },
        create: { ...characteristics, projectId: id, organizationId: ctx.organizationId },
        update: characteristics,
      });
      const cc = diff(before.characteristics ?? {}, c);
      if (cc) changes.characteristics = { changed: true, fields: Object.keys(cc) } as never;
    }
    if (Object.keys(changes).length) await audit(tx, ctx, "project", id, "UPDATE", changes);
  });
  return getProject(ctx, id);
}

/** RF-003: edição isolada da caracterização técnica. */
export async function updateCharacteristics(ctx: Ctx, projectId: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(projectId, "Empreendimento");
  const data = characteristicsSchema.parse(raw);
  await loadProject(db, ctx, projectId);
  await db.$transaction(async (tx) => {
    const before = await tx.projectCharacteristics.findUnique({ where: { projectId } });
    const c = await tx.projectCharacteristics.upsert({
      where: { projectId },
      create: { ...data, projectId, organizationId: ctx.organizationId },
      update: data,
    });
    const changes = diff(before ?? {}, c);
    if (changes) await audit(tx, ctx, "project_characteristics", projectId, before ? "UPDATE" : "CREATE", changes);
  });
  return getProject(ctx, projectId);
}

async function setStatus(ctx: Ctx, id: string, status: "ACTIVE" | "INACTIVE") {
  requireAdmin(ctx);
  ensureUuid(id, "Empreendimento");
  const before = await loadProject(db, ctx, id);
  if (before.status !== status) {
    if (status === "ACTIVE") {
      const client = await db.client.findUnique({ where: { id: before.clientId } });
      if (client?.status !== "ACTIVE") throw conflict("CLIENT_INACTIVE", "Reative o cliente antes de reativar o empreendimento.");
    }
    // Desativar NÃO altera edificações, localizações, responsáveis nem histórico.
    await db.$transaction(async (tx) => {
      await tx.project.update({ where: { id }, data: { status } });
      await audit(tx, ctx, "project", id, status === "INACTIVE" ? "DEACTIVATE" : "REACTIVATE");
    });
  }
  return getProject(ctx, id);
}

export const deactivateProject = (ctx: Ctx, id: string) => setStatus(ctx, id, "INACTIVE");
export const reactivateProject = (ctx: Ctx, id: string) => setStatus(ctx, id, "ACTIVE");

const ENVIRONMENT_TYPES = ["ROOM", "CIRCULATION", "TECHNICAL_AREA", "EXTERNAL_AREA", "OTHER"] as const;

/** Tela 05: indicadores calculados a partir dos registros existentes. */
export async function getProjectOverview(ctx: Ctx, id: string) {
  ensureUuid(id, "Empreendimento");
  const project = await getProject(ctx, id);
  const org = ctx.organizationId;
  const today = todayISO();

  const [bGroups, lGroups, commonCount, assignments, maxes] = await Promise.all([
    db.building.groupBy({ by: ["status"], where: { projectId: id, organizationId: org }, _count: { _all: true } }),
    db.location.groupBy({ by: ["locationType", "status"], where: { projectId: id, organizationId: org }, _count: { _all: true } }),
    db.location.count({ where: { projectId: id, organizationId: org, areaClass: "COMMON", status: "ACTIVE" } }),
    db.projectResponsibleAssignment.findMany({
      where: { projectId: id, organizationId: org, startDate: { lte: new Date(`${today}T00:00:00.000Z`) }, OR: [{ endDate: null }, { endDate: { gte: new Date(`${today}T00:00:00.000Z`) } }] },
      include: { responsible: true },
      orderBy: [{ role: "asc" }, { startDate: "asc" }],
    }),
    Promise.all([
      db.building.aggregate({ where: { projectId: id }, _max: { updatedAt: true } }),
      db.location.aggregate({ where: { projectId: id }, _max: { updatedAt: true } }),
      db.projectResponsibleAssignment.aggregate({ where: { projectId: id }, _max: { updatedAt: true } }),
      db.projectHistory.aggregate({ where: { projectId: id }, _max: { updatedAt: true } }),
      db.privateUnit.aggregate({ where: { projectId: id }, _max: { updatedAt: true } }),
    ]),
  ]);

  const count = (pred: (g: (typeof lGroups)[number]) => boolean, status: "ACTIVE" | "INACTIVE") =>
    lGroups.filter((g) => pred(g) && g.status === status).reduce((s, g) => s + g._count._all, 0);
  const metric = (pred: (g: (typeof lGroups)[number]) => boolean) => ({
    active: count(pred, "ACTIVE"),
    inactive: count(pred, "INACTIVE"),
  });
  const buildings = {
    active: bGroups.find((g) => g.status === "ACTIVE")?._count._all ?? 0,
    inactive: bGroups.find((g) => g.status === "INACTIVE")?._count._all ?? 0,
  };

  const dates = [
    new Date(project.updatedAt),
    ...(project.characteristics ? [new Date(project.characteristics.updatedAt)] : []),
    ...maxes.map((m) => m._max.updatedAt).filter((d): d is Date => !!d),
  ];
  const lastUpdate = new Date(Math.max(...dates.map((d) => d.getTime())));

  return {
    project,
    indicators: {
      buildings,
      floors: metric((g) => g.locationType === "FLOOR"),
      environments: metric((g) => (ENVIRONMENT_TYPES as readonly string[]).includes(g.locationType)),
      units: metric((g) => g.locationType === "UNIT"),
      commonAreas: { active: commonCount },
    },
    responsibles: assignments.map((a) => serializeAssignment(ctx, a, today)),
    lastUpdate: ts(lastUpdate),
  };
}

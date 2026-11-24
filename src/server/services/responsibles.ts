import { db, Prisma } from "../db";
import type { Ctx } from "../context";
import { requireWrite } from "../context";
import { conflict, invalid, notFound } from "../errors";
import { audit, diff } from "../audit";
import {
  assignmentCreateSchema,
  assignmentListQuery,
  assignmentUpdateSchema,
  responsibleListQuery,
  responsibleSchema,
  toDate,
} from "../validation";
import { serializeAssignment, serializeResponsible } from "../serializers";
import { todayISO } from "@/lib/dates";
import { ensureUuid, loadActiveProject, loadProject } from "./common";

const REDACT = ["email", "phone", "notes"];

export async function listResponsibles(ctx: Ctx, rawQuery: unknown) {
  const q = responsibleListQuery.parse(rawQuery ?? {});
  const where: Prisma.ProjectResponsibleWhereInput = { organizationId: ctx.organizationId };
  if (q.status && q.status !== "ALL") where.status = q.status;
  if (q.q) where.OR = [{ name: { contains: q.q, mode: "insensitive" } }, { companyName: { contains: q.q, mode: "insensitive" } }];
  const rows = await db.projectResponsible.findMany({
    where,
    orderBy: [{ name: "asc" }],
    take: 200,
    include: { _count: { select: { assignments: true } } },
  });
  return rows.map((r) => ({ ...serializeResponsible(ctx, r), assignmentCount: r._count.assignments }));
}

export async function createResponsible(ctx: Ctx, raw: unknown) {
  requireWrite(ctx);
  const input = responsibleSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const r = await tx.projectResponsible.create({ data: { ...input, organizationId: ctx.organizationId } });
    await audit(tx, ctx, "responsible", r.id, "CREATE");
    return serializeResponsible(ctx, r);
  });
}

export async function updateResponsible(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(id, "Responsável");
  const input = responsibleSchema.parse(raw);
  const before = await db.projectResponsible.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!before) throw notFound("Responsável");
  return db.$transaction(async (tx) => {
    const r = await tx.projectResponsible.update({ where: { id }, data: input });
    const changes = diff(before, r, { redact: REDACT });
    if (changes) await audit(tx, ctx, "responsible", id, "UPDATE", changes);
    return serializeResponsible(ctx, r);
  });
}

export async function setResponsibleStatus(ctx: Ctx, id: string, status: "ACTIVE" | "INACTIVE") {
  requireWrite(ctx);
  ensureUuid(id, "Responsável");
  const before = await db.projectResponsible.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!before) throw notFound("Responsável");
  return db.$transaction(async (tx) => {
    const r = await tx.projectResponsible.update({ where: { id }, data: { status } });
    await audit(tx, ctx, "responsible", id, status === "INACTIVE" ? "DEACTIVATE" : "REACTIVATE");
    return serializeResponsible(ctx, r);
  });
}

// ───────────────── vínculos com o empreendimento ─────────────────

export async function listAssignments(ctx: Ctx, projectId: string, rawQuery: unknown) {
  ensureUuid(projectId, "Empreendimento");
  await loadProject(db, ctx, projectId);
  const q = assignmentListQuery.parse(rawQuery ?? {});
  const today = todayISO();
  const rows = await db.projectResponsibleAssignment.findMany({
    where: { projectId, organizationId: ctx.organizationId },
    include: { responsible: true },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });
  const items = rows.map((a) => serializeAssignment(ctx, a, today));
  if (q.current === "true") return items.filter((i) => i.current);
  if (q.current === "false") return items.filter((i) => !i.current);
  return items;
}

/** Evita dois períodos sobrepostos para a mesma pessoa e função no mesmo empreendimento. */
async function assertNoOverlap(
  projectId: string,
  responsibleId: string,
  role: string,
  start: string,
  end: string | null,
  exceptId?: string,
) {
  const others = await db.projectResponsibleAssignment.findMany({
    where: { projectId, responsibleId, role: role as never, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { startDate: true, endDate: true },
  });
  const s = start;
  const e = end ?? "9999-12-31";
  for (const o of others) {
    const os = o.startDate.toISOString().slice(0, 10);
    const oe = o.endDate ? o.endDate.toISOString().slice(0, 10) : "9999-12-31";
    if (s <= oe && os <= e)
      throw conflict("OVERLAP", "Este responsável já possui vínculo com esta função em período sobreposto.", { fields: { startDate: "Período sobreposto." } });
  }
}

export async function createAssignment(ctx: Ctx, projectId: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(projectId, "Empreendimento");
  const input = assignmentCreateSchema.parse(raw);
  await loadActiveProject(db, ctx, projectId);

  let responsibleId = input.responsibleId;
  if (responsibleId) {
    const r = await db.projectResponsible.findFirst({ where: { id: responsibleId, organizationId: ctx.organizationId } });
    if (!r) throw notFound("Responsável");
    if (r.status !== "ACTIVE") throw conflict("INACTIVE", "O responsável está inativo.");
    await assertNoOverlap(projectId, responsibleId, input.role, input.startDate, input.endDate);
  }

  const id = await db.$transaction(async (tx) => {
    if (!responsibleId) {
      const created = await tx.projectResponsible.create({ data: { ...input.responsible!, organizationId: ctx.organizationId } });
      responsibleId = created.id;
      await audit(tx, ctx, "responsible", created.id, "CREATE");
    }
    const a = await tx.projectResponsibleAssignment.create({
      data: {
        organizationId: ctx.organizationId,
        projectId,
        responsibleId: responsibleId!,
        role: input.role,
        roleDetail: input.role === "OTHER" ? input.roleDetail : null,
        startDate: toDate(input.startDate),
        endDate: input.endDate ? toDate(input.endDate) : null,
        notes: input.notes,
      },
    });
    await audit(tx, ctx, "assignment", a.id, "CREATE", { projectId, responsibleId, role: a.role });
    return a.id;
  });
  return getAssignment(ctx, id);
}

async function getAssignment(ctx: Ctx, id: string) {
  const a = await db.projectResponsibleAssignment.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { responsible: true },
  });
  if (!a) throw notFound("Vínculo");
  return serializeAssignment(ctx, a, todayISO());
}

export async function updateAssignment(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(id, "Vínculo");
  const input = assignmentUpdateSchema.parse(raw);
  const before = await db.projectResponsibleAssignment.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!before) throw notFound("Vínculo");

  const start = input.startDate ?? before.startDate.toISOString().slice(0, 10);
  const end = input.endDate !== undefined ? input.endDate : before.endDate ? before.endDate.toISOString().slice(0, 10) : null;
  const role = input.role ?? before.role;
  if (end && end < start) throw invalid("A data de término não pode ser anterior ao início.", { endDate: "Data de término inválida." });
  const roleDetail = role === "OTHER" ? (input.roleDetail !== undefined ? input.roleDetail : before.roleDetail) : null;
  if (role === "OTHER" && !roleDetail) throw invalid("Descreva a função.", { roleDetail: "Descreva a função." });
  await assertNoOverlap(before.projectId, before.responsibleId, role, start, end, id);

  await db.$transaction(async (tx) => {
    const a = await tx.projectResponsibleAssignment.update({
      where: { id },
      data: {
        role,
        roleDetail,
        startDate: toDate(start),
        endDate: end ? toDate(end) : null,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    const changes = diff(before, a, { redact: ["notes"] });
    if (changes) await audit(tx, ctx, "assignment", id, "UPDATE", changes);
  });
  return getAssignment(ctx, id);
}

/** "Desvincular": encerra o período preservando o histórico (não apaga o vínculo). */
export async function endAssignment(ctx: Ctx, id: string, rawEndDate?: unknown) {
  requireWrite(ctx);
  ensureUuid(id, "Vínculo");
  const before = await db.projectResponsibleAssignment.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!before) throw notFound("Vínculo");
  const endDate = typeof rawEndDate === "string" && rawEndDate ? rawEndDate : todayISO();
  const parsed = assignmentUpdateSchema.parse({ endDate });
  const start = before.startDate.toISOString().slice(0, 10);
  if (parsed.endDate && parsed.endDate < start) throw invalid("A data de término não pode ser anterior ao início.", { endDate: "Data de término inválida." });
  await db.$transaction(async (tx) => {
    await tx.projectResponsibleAssignment.update({ where: { id }, data: { endDate: toDate(parsed.endDate!) } });
    await audit(tx, ctx, "assignment", id, "END", { endDate: parsed.endDate });
  });
  return getAssignment(ctx, id);
}

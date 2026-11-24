import crypto from "node:crypto";
import { db, Prisma } from "../db";
import type { Ctx } from "../context";
import { requireWrite } from "../context";
import { conflict, notFound } from "../errors";
import { audit, diff } from "../audit";
import { historyListQuery, historySchema, toDate, voidSchema } from "../validation";
import { day, ts } from "../serializers";
import { ensureUuid, loadActiveProject, loadProject } from "./common";
import { removeFile, readFile, safeFileName, saveFile, validateUpload } from "../storage";

type Row = Prisma.ProjectHistoryGetPayload<{ include: { attachments: true } }>;

function serialize(h: Row, userNames: Map<string, string>) {
  return {
    id: h.id,
    projectId: h.projectId,
    category: h.category,
    title: h.title,
    description: h.description,
    occurredOn: day(h.occurredOn)!,
    recordedAt: ts(h.createdAt),
    recordedBy: h.recordedByUserId ? { id: h.recordedByUserId, name: userNames.get(h.recordedByUserId) ?? "Usuário removido" } : null,
    notes: h.notes,
    sourceType: h.sourceType,
    sourceId: h.sourceId,
    status: h.status,
    voidReason: h.voidReason,
    updatedAt: ts(h.updatedAt),
    attachments: h.attachments
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, createdAt: ts(a.createdAt) })),
  };
}

async function names(ctx: Ctx, rows: Row[]) {
  const ids = [...new Set(rows.map((r) => r.recordedByUserId).filter((x): x is string => !!x))];
  if (!ids.length) return new Map<string, string>();
  const users = await db.user.findMany({ where: { id: { in: ids }, organizationId: ctx.organizationId }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

export async function listHistory(ctx: Ctx, projectId: string, rawQuery: unknown) {
  ensureUuid(projectId, "Empreendimento");
  await loadProject(db, ctx, projectId);
  const q = historyListQuery.parse(rawQuery ?? {});
  const where: Prisma.ProjectHistoryWhereInput = { projectId, organizationId: ctx.organizationId };
  if (q.category) where.category = q.category;
  if (q.from || q.to) where.occurredOn = { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lte: toDate(q.to) } : {}) };
  if (q.includeVoided !== "true") where.status = "ACTIVE";
  const rows = await db.projectHistory.findMany({
    where,
    include: { attachments: true },
    orderBy: [{ occurredOn: q.order }, { createdAt: q.order }],
  });
  const n = await names(ctx, rows);
  return rows.map((r) => serialize(r, n));
}

async function loadEntry(ctx: Ctx, id: string) {
  ensureUuid(id, "Registro de histórico");
  const h = await db.projectHistory.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { attachments: true } });
  if (!h) throw notFound("Registro de histórico");
  return h;
}

export async function getHistoryEntry(ctx: Ctx, id: string) {
  const h = await loadEntry(ctx, id);
  return serialize(h, await names(ctx, [h]));
}

export async function createHistory(ctx: Ctx, projectId: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(projectId, "Empreendimento");
  const input = historySchema.parse(raw);
  await loadActiveProject(db, ctx, projectId);
  const id = await db.$transaction(async (tx) => {
    const h = await tx.projectHistory.create({
      data: { ...input, occurredOn: toDate(input.occurredOn), projectId, organizationId: ctx.organizationId, recordedByUserId: ctx.userId },
    });
    await audit(tx, ctx, "history", h.id, "CREATE", { category: h.category });
    return h.id;
  });
  return getHistoryEntry(ctx, id);
}

/** Edição mantém rastreabilidade: cada alteração gera registro de auditoria com antes/depois. */
export async function updateHistory(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  const input = historySchema.parse(raw);
  const before = await loadEntry(ctx, id);
  if (before.status !== "ACTIVE") throw conflict("VOIDED", "Registros anulados não podem ser editados.");
  await db.$transaction(async (tx) => {
    const h = await tx.projectHistory.update({ where: { id }, data: { ...input, occurredOn: toDate(input.occurredOn) } });
    const changes = diff(before, h);
    if (changes) await audit(tx, ctx, "history", id, "UPDATE", changes);
  });
  return getHistoryEntry(ctx, id);
}

/** Registros de histórico nunca são apagados: são anulados com justificativa. */
export async function voidHistory(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  const { reason } = voidSchema.parse(raw);
  const before = await loadEntry(ctx, id);
  if (before.status === "INACTIVE") return getHistoryEntry(ctx, id);
  await db.$transaction(async (tx) => {
    await tx.projectHistory.update({ where: { id }, data: { status: "INACTIVE", voidReason: reason } });
    await audit(tx, ctx, "history", id, "VOID", { reason });
  });
  return getHistoryEntry(ctx, id);
}

export async function restoreHistory(ctx: Ctx, id: string) {
  requireWrite(ctx);
  const before = await loadEntry(ctx, id);
  if (before.status === "ACTIVE") return getHistoryEntry(ctx, id);
  await db.$transaction(async (tx) => {
    await tx.projectHistory.update({ where: { id }, data: { status: "ACTIVE", voidReason: null } });
    await audit(tx, ctx, "history", id, "RESTORE");
  });
  return getHistoryEntry(ctx, id);
}

// ───────────────────── anexos ─────────────────────

export async function addAttachment(ctx: Ctx, historyId: string, file: { name: string; type: string; data: Buffer }) {
  requireWrite(ctx);
  const h = await loadEntry(ctx, historyId);
  if (h.status !== "ACTIVE") throw conflict("VOIDED", "Não é possível anexar a registros anulados.");
  const { mime } = validateUpload(file.name, file.type, file.data);
  const key = await saveFile(ctx.organizationId, historyId, file.data);
  try {
    const a = await db.$transaction(async (tx) => {
      const created = await tx.projectHistoryAttachment.create({
        data: {
          organizationId: ctx.organizationId,
          historyId,
          fileName: safeFileName(file.name),
          mimeType: mime,
          sizeBytes: file.data.length,
          sha256: crypto.createHash("sha256").update(file.data).digest("hex"),
          storageKey: key,
          uploadedByUserId: ctx.userId,
        },
      });
      await audit(tx, ctx, "history", historyId, "ATTACH", { attachmentId: created.id, fileName: created.fileName });
      return created;
    });
    return { id: a.id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, createdAt: ts(a.createdAt) };
  } catch (e) {
    await removeFile(key);
    throw e;
  }
}

/** Download: confere organização antes de ler o arquivo. */
export async function getAttachmentFile(ctx: Ctx, attachmentId: string) {
  ensureUuid(attachmentId, "Anexo");
  const a = await db.projectHistoryAttachment.findFirst({ where: { id: attachmentId, organizationId: ctx.organizationId } });
  if (!a) throw notFound("Anexo");
  const data = await readFile(a.storageKey).catch(() => {
    throw notFound("Arquivo");
  });
  return { fileName: a.fileName, mimeType: a.mimeType, data };
}

export async function deleteAttachment(ctx: Ctx, attachmentId: string) {
  requireWrite(ctx);
  ensureUuid(attachmentId, "Anexo");
  const a = await db.projectHistoryAttachment.findFirst({ where: { id: attachmentId, organizationId: ctx.organizationId } });
  if (!a) throw notFound("Anexo");
  await db.$transaction(async (tx) => {
    await tx.projectHistoryAttachment.delete({ where: { id: attachmentId } });
    await audit(tx, ctx, "history", a.historyId, "DETACH", { attachmentId, fileName: a.fileName });
  });
  await removeFile(a.storageKey);
  return { ok: true };
}

export async function listAudit(ctx: Ctx, entityType: string, entityId: string) {
  ensureUuid(entityId);
  const rows = await db.auditLog.findMany({
    where: { organizationId: ctx.organizationId, entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const users = await db.user.findMany({
    where: { id: { in: rows.map((r) => r.userId).filter((x): x is string => !!x) }, organizationId: ctx.organizationId },
    select: { id: true, name: true },
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    changes: r.changes,
    createdAt: ts(r.createdAt),
    user: users.find((u) => u.id === r.userId)?.name ?? null,
  }));
}

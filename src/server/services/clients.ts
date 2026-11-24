import { db, Prisma } from "../db";
import type { Ctx } from "../context";
import { requireAdmin, requireWrite } from "../context";
import { conflict, notFound } from "../errors";
import { audit, diff } from "../audit";
import { clientListQuery, clientSchema } from "../validation";
import { serializeClient } from "../serializers";
import { normalizeDocument } from "@/lib/document";
import { ensureUuid, pageArgs } from "./common";

const REDACT = ["document", "email", "phone", "contactName", "notes", "addressLine", "addressNumber", "complement", "district", "zipCode"];

export async function listClients(ctx: Ctx, rawQuery: unknown) {
  const q = clientListQuery.parse(rawQuery ?? {});
  const where: Prisma.ClientWhereInput = { organizationId: ctx.organizationId };
  if (q.status && q.status !== "ALL") where.status = q.status;
  if (q.personType) where.personType = q.personType;
  if (q.q) {
    const nd = normalizeDocument(q.q);
    where.OR = [
      { name: { contains: q.q, mode: "insensitive" } },
      { tradeName: { contains: q.q, mode: "insensitive" } },
      ...(nd.length >= 3 ? [{ document: { contains: nd } }] : []),
    ];
  }
  const [total, rows] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      include: { _count: { select: { projects: true } } },
      ...pageArgs(q.page, q.pageSize),
    }),
  ]);
  return {
    total,
    page: q.page,
    pageSize: q.pageSize,
    items: rows.map((c) => ({ ...serializeClient(ctx, c), projectCount: c._count.projects })),
  };
}

export async function getClient(ctx: Ctx, id: string) {
  ensureUuid(id, "Cliente");
  const c = await db.client.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      projects: {
        orderBy: { name: "asc" },
        select: { id: true, code: true, name: true, projectType: true, status: true, city: true, state: true },
      },
    },
  });
  if (!c) throw notFound("Cliente");
  return { ...serializeClient(ctx, c), projects: c.projects };
}

async function assertNoDuplicateDocument(ctx: Ctx, document: string | null, exceptId?: string) {
  if (!document) return;
  const dup = await db.client.findFirst({
    where: { organizationId: ctx.organizationId, document, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, name: true },
  });
  if (dup) throw conflict("DUPLICATE_DOCUMENT", `Já existe um cliente com este CPF/CNPJ: ${dup.name}.`, { clientId: dup.id });
}

export async function createClient(ctx: Ctx, raw: unknown) {
  requireWrite(ctx);
  const input = clientSchema.parse(raw);
  await assertNoDuplicateDocument(ctx, input.document);
  return db.$transaction(async (tx) => {
    const c = await tx.client.create({ data: { ...input, organizationId: ctx.organizationId } });
    await audit(tx, ctx, "client", c.id, "CREATE");
    return serializeClient(ctx, c);
  });
}

export async function updateClient(ctx: Ctx, id: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(id, "Cliente");
  const input = clientSchema.parse(raw);
  const before = await db.client.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!before) throw notFound("Cliente");
  await assertNoDuplicateDocument(ctx, input.document, id);
  return db.$transaction(async (tx) => {
    const c = await tx.client.update({ where: { id }, data: input });
    const changes = diff(before, c, { redact: REDACT });
    if (changes) await audit(tx, ctx, "client", id, "UPDATE", changes);
    return serializeClient(ctx, c);
  });
}

async function setStatus(ctx: Ctx, id: string, status: "ACTIVE" | "INACTIVE") {
  requireAdmin(ctx);
  ensureUuid(id, "Cliente");
  const before = await db.client.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!before) throw notFound("Cliente");
  if (before.status === status) return serializeClient(ctx, before);
  return db.$transaction(async (tx) => {
    // Desativar NÃO apaga nem desativa empreendimentos: o histórico permanece íntegro.
    const c = await tx.client.update({ where: { id }, data: { status } });
    await audit(tx, ctx, "client", id, status === "INACTIVE" ? "DEACTIVATE" : "REACTIVATE");
    return serializeClient(ctx, c);
  });
}

export const deactivateClient = (ctx: Ctx, id: string) => setStatus(ctx, id, "INACTIVE");
export const reactivateClient = (ctx: Ctx, id: string) => setStatus(ctx, id, "ACTIVE");

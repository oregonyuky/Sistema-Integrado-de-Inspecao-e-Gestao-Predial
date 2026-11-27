import { db } from "../db";
import type { Ctx } from "../context";
import { requireWrite } from "../context";
import { conflict, notFound } from "../errors";
import { audit } from "../audit";
import { projectSystemSchema } from "../validation";
import { ts } from "../serializers";
import { ensureUuid, loadActiveProject, loadProject } from "./common";
import { loadCatalogItem } from "./catalog";

/** Sistemas do catálogo com a indicação de quais estão selecionados no empreendimento (RF-018). */
export async function listProjectSystems(ctx: Ctx, projectId: string) {
  ensureUuid(projectId, "Empreendimento");
  await loadProject(db, ctx, projectId);
  const [systems, selected, comps] = await Promise.all([
    db.catalogItem.findMany({ where: { organizationId: ctx.organizationId, kind: "SYSTEM" }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    db.projectSystem.findMany({ where: { projectId, organizationId: ctx.organizationId } }),
    db.component.findMany({ where: { projectId, organizationId: ctx.organizationId, status: "ACTIVE" }, select: { type: { select: { id: true, parentId: true, kind: true } } } }),
  ]);
  const subs = await db.catalogItem.findMany({ where: { organizationId: ctx.organizationId, kind: "SUBSYSTEM" }, select: { id: true, parentId: true } });
  const sysOfType = (t: { parentId: string | null }) => subs.find((s) => s.id === t.parentId)?.parentId ?? t.parentId;
  return systems.map((s) => {
    const sel = selected.find((x) => x.systemId === s.id);
    return {
      systemId: s.id, code: s.code, name: s.name, description: s.description, catalogStatus: s.status,
      selected: sel?.status === "ACTIVE", notes: sel?.notes ?? null, selectedSince: sel ? ts(sel.createdAt) : null,
      componentCount: comps.filter((c) => sysOfType(c.type) === s.id).length,
    };
  });
}

export async function selectProjectSystem(ctx: Ctx, projectId: string, raw: unknown) {
  requireWrite(ctx);
  ensureUuid(projectId, "Empreendimento");
  const input = projectSystemSchema.parse(raw);
  await loadActiveProject(db, ctx, projectId);
  const sys = await loadCatalogItem(db, ctx, input.systemId);
  if (sys.kind !== "SYSTEM") throw conflict("INVALID_KIND", "O item informado não é um sistema.");
  if (sys.status !== "ACTIVE") throw conflict("INACTIVE", "Este sistema está inativo no catálogo e não pode ser selecionado.");
  const existing = await db.projectSystem.findUnique({ where: { projectId_systemId: { projectId, systemId: sys.id } } });
  if (existing?.status === "ACTIVE") throw conflict("ALREADY_SELECTED", "Este sistema já está selecionado no empreendimento.");
  return db.$transaction(async (tx) => {
    const row = existing
      ? await tx.projectSystem.update({ where: { id: existing.id }, data: { status: "ACTIVE", notes: input.notes } })
      : await tx.projectSystem.create({ data: { organizationId: ctx.organizationId, projectId, systemId: sys.id, notes: input.notes } });
    await audit(tx, ctx, "project_system", row.id, existing ? "REACTIVATE" : "CREATE", { projectId, system: sys.code });
    return { id: row.id, systemId: sys.id, status: row.status };
  });
}

/** Remove a seleção (lógica). Bloqueia se ainda houver componentes ativos do sistema no empreendimento. */
export async function deselectProjectSystem(ctx: Ctx, projectId: string, systemId: string) {
  requireWrite(ctx);
  ensureUuid(projectId, "Empreendimento");
  ensureUuid(systemId, "Sistema");
  await loadActiveProject(db, ctx, projectId);
  const row = await db.projectSystem.findUnique({ where: { projectId_systemId: { projectId, systemId } } });
  if (!row || row.organizationId !== ctx.organizationId || row.status !== "ACTIVE") throw notFound("Seleção de sistema");
  const list = await listProjectSystems(ctx, projectId);
  const n = list.find((s) => s.systemId === systemId)?.componentCount ?? 0;
  if (n > 0) throw conflict("HAS_COMPONENTS", `Há ${n} componente(s) ativo(s) deste sistema no empreendimento. Desative-os antes de remover o sistema.`);
  await db.$transaction(async (tx) => {
    await tx.projectSystem.update({ where: { id: row.id }, data: { status: "INACTIVE" } });
    await audit(tx, ctx, "project_system", row.id, "DEACTIVATE", { projectId });
  });
  return { ok: true };
}

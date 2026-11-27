"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { api, qs } from "@/ui/api";
import { useProject } from "@/components/ProjectContext";
import { ComponentModal } from "@/components/ComponentModal";
import type { CatItem } from "@/components/catalog-types";
import { Empty, ErrorBox, Loading, Pager, SelectField, StatusBadge, TextField, useAction, useCan, useDebounced, useFetch } from "@/ui/kit";

type Comp = { id: string; publicCode: string; name: string; tag: string | null; status: "ACTIVE" | "INACTIVE"; type: { id: string; name: string } | null; system: { id: string; name: string } | null; subsystem: { name: string } | null; location: { name: string; path: string[] | null } | null };
type Res = { total: number; page: number; pageSize: number; items: Comp[] };

function Inner() {
  const { project } = useProject(); const can = useCan(); const { busy, run } = useAction();
  const sp = useSearchParams();
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [systemId, setSystemId] = useState(sp.get("systemId") ?? ""); const [typeId, setTypeId] = useState("");
  const [status, setStatus] = useState("ACTIVE"); const [page, setPage] = useState(1);
  const [create, setCreate] = useState(false);
  const cat = useFetch<{ items: CatItem[] }>("/api/catalog");
  const { data, error, loading, reload } = useFetch<Res>(`/api/projects/${project.id}/components${qs({ q: dq, systemId, typeId, status, page, pageSize: 20 })}`);
  const systems = (cat.data?.items ?? []).filter((i) => i.kind === "SYSTEM");
  const types = useMemo(() => (cat.data?.items ?? []).filter((i) => {
    if (i.kind !== "TYPE") return false; if (!systemId) return true;
    const p = cat.data!.items.find((x) => x.id === i.parentId); return p?.id === systemId || p?.parentId === systemId;
  }), [cat.data, systemId]);
  const editable = can.write && project.status === "ACTIVE";
  const base = `/empreendimentos/${project.id}/componentes`;
  async function toggle(c: Comp) { await run(() => api(`/api/components/${c.id}/${c.status === "ACTIVE" ? "deactivate" : "reactivate"}`, { method: "POST" }), c.status === "ACTIVE" ? "Componente desativado." : "Componente reativado."); reload(); }

  return (
    <div className="stack">
      <div className="toolbar">
        <TextField label="Buscar" name="q" value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Nome, plaqueta, ID, nº de série" />
        <SelectField label="Sistema" name="systemId" value={systemId} onChange={(v) => { setSystemId(v); setTypeId(""); setPage(1); }} options={systems.map((s) => [s.id, s.name])} placeholder="Todos" />
        <SelectField label="Tipo" name="typeId" value={typeId} onChange={(v) => { setTypeId(v); setPage(1); }} options={types.map((s) => [s.id, s.name])} placeholder="Todos" />
        <SelectField label="Situação" name="status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[["ACTIVE", "Ativos"], ["INACTIVE", "Inativos"], ["ALL", "Todos"]]} />
        {editable && <button className="btn btn-primary" onClick={() => setCreate(true)}>Novo componente</button>}
      </div>
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : !data?.items.length ? (
        <Empty title="Nenhum componente encontrado">{editable ? <>Para cadastrar, primeiro <Link href={`/empreendimentos/${project.id}/sistemas`}>selecione os sistemas</Link> do empreendimento.</> : "Ajuste os filtros."}</Empty>
      ) : (<>
        <div className="tablewrap"><table className="t"><thead><tr><th>ID</th><th>Componente</th><th>Sistema › Tipo</th><th>Local</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>
          {data.items.map((c) => (
            <tr key={c.id} style={c.status === "INACTIVE" ? { opacity: 0.7 } : undefined}>
              <td className="mono">{c.publicCode}</td>
              <td><Link href={`${base}/${c.id}`}><b>{c.name}</b></Link>{c.tag && <div className="sub muted">Plaqueta {c.tag}</div>}</td>
              <td>{[c.system?.name, c.subsystem?.name, c.type?.name].filter(Boolean).join(" › ")}</td>
              <td>{c.location ? (c.location.path ?? [c.location.name]).join(" › ") : <span className="muted">Sem local</span>}</td>
              <td><StatusBadge status={c.status} /></td>
              <td className="rowact"><Link className="btn btn-quiet btn-sm" href={`${base}/${c.id}`}>Abrir</Link>{editable && <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => toggle(c)}>{c.status === "ACTIVE" ? "Desativar" : "Reativar"}</button>}</td>
            </tr>))}
        </tbody></table></div>
        <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
      </>)}
      <ComponentModal projectId={project.id} open={create} component={null} onClose={() => setCreate(false)} onSaved={() => { setCreate(false); reload(); }} />
    </div>
  );
}
export default function ComponentsPage() { return <Suspense fallback={<Loading />}><Inner /></Suspense>; }

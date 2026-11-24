"use client";
import Link from "next/link";
import { useState } from "react";
import { api, qs } from "@/ui/api";
import { Empty, ErrorBox, Loading, Pager, SelectField, StatusBadge, TextField, opts, useAction, useCan, useConfirm, useDebounced, useFetch } from "@/ui/kit";
import { projectTypeLabels } from "@/lib/labels";

type Row = { id: string; code: string; name: string; projectType: keyof typeof projectTypeLabels; city: string; state: string; status: "ACTIVE" | "INACTIVE"; client: { id: string; name: string } };
type List = { total: number; page: number; pageSize: number; items: Row[] };

export default function ProjectsPage() {
  const can = useCan(); const confirm = useConfirm(); const { busy, run } = useAction();
  const [q, setQ] = useState(""); const [status, setStatus] = useState("ACTIVE"); const [type, setType] = useState(""); const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useFetch<List>(`/api/projects${qs({ q: dq, status, projectType: type, page })}`);
  const filtered = !!(dq || type || status !== "ACTIVE");

  async function toggle(p: Row) {
    if (p.status === "ACTIVE") {
      const r = await confirm({ title: "Desativar empreendimento?", danger: true, confirmLabel: "Desativar",
        message: <>O empreendimento <b>{p.name}</b> ficará somente para consulta: não será possível alterar sua estrutura, responsáveis ou histórico até reativá-lo. Nada é apagado.</> });
      if (!r.ok) return;
      await run(() => api(`/api/projects/${p.id}/deactivate`, { method: "POST" }), "Empreendimento desativado.");
    } else await run(() => api(`/api/projects/${p.id}/reactivate`, { method: "POST" }), "Empreendimento reativado.");
    reload();
  }

  return (
    <>
      <div className="pagehead">
        <div><h1>Empreendimentos</h1><p className="meta">Condomínios, edifícios e demais edificações sob gestão.</p></div>
        {can.write && <Link href="/empreendimentos/novo" className="btn btn-primary">Novo empreendimento</Link>}
      </div>
      <div className="toolbar" role="search">
        <div className="grow"><TextField label="Buscar" name="q" value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Nome, código ou cidade" /></div>
        <SelectField label="Tipo" name="type" value={type} onChange={(v) => { setType(v); setPage(1); }} placeholder="Todos" options={opts(projectTypeLabels)} />
        <SelectField label="Situação" name="status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[["ACTIVE", "Ativos"], ["INACTIVE", "Inativos"], ["ALL", "Todos"]]} />
      </div>
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : !data?.items.length ? (
        <Empty title={filtered ? "Nenhum empreendimento encontrado" : "Nenhum empreendimento cadastrado"}
          action={can.write && !filtered ? <Link className="btn btn-primary" href="/empreendimentos/novo">Cadastrar empreendimento</Link> : undefined}>
          {filtered ? "Ajuste a busca ou os filtros." : "Cadastre o primeiro empreendimento para começar a montar sua estrutura física."}
        </Empty>
      ) : (
        <div style={{ opacity: loading ? 0.6 : 1 }} aria-busy={loading}>
          <div className="tablewrap"><table className="t stack">
            <thead><tr><th>Empreendimento</th><th>Cliente</th><th>Tipo</th><th>Cidade</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{data.items.map((p) => (
              <tr key={p.id}>
                <td className="first"><Link className="name" href={`/empreendimentos/${p.id}`}>{p.name}</Link><div className="sub mono">{p.code}</div></td>
                <td data-label="Cliente">{p.client.name}</td>
                <td data-label="Tipo">{projectTypeLabels[p.projectType]}</td>
                <td data-label="Cidade">{p.city}/{p.state}</td>
                <td data-label="Situação"><StatusBadge status={p.status} /></td>
                <td className="acts"><div className="rowact">
                  <Link className="btn btn-quiet btn-sm" href={`/empreendimentos/${p.id}`}>Abrir</Link>
                  {can.write && <Link className="btn btn-quiet btn-sm" href={`/empreendimentos/${p.id}/editar`}>Editar</Link>}
                  {can.admin && <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => toggle(p)}>{p.status === "ACTIVE" ? "Desativar" : "Reativar"}</button>}
                </div></td>
              </tr>))}</tbody>
          </table></div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </div>
      )}
    </>
  );
}

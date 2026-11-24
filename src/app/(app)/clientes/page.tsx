"use client";
import Link from "next/link";
import { useState } from "react";
import { api, qs } from "@/ui/api";
import { Empty, ErrorBox, Loading, Pager, StatusBadge, useAction, useCan, useConfirm, useDebounced, useFetch, SelectField, TextField, opts } from "@/ui/kit";
import { personTypeLabels } from "@/lib/labels";
import { formatDocument } from "@/lib/document";
import { formatPhone } from "@/lib/format";

type Row = { id: string; personType: "INDIVIDUAL" | "LEGAL_ENTITY"; name: string; tradeName: string | null; document: string | null; email: string | null; phone: string | null; city: string | null; state: string | null; status: "ACTIVE" | "INACTIVE"; projectCount: number; masked: boolean };
type List = { total: number; page: number; pageSize: number; items: Row[] };

export default function ClientsPage() {
  const can = useCan();
  const confirm = useConfirm();
  const { busy, run } = useAction();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useFetch<List>(`/api/clients${qs({ q: dq, status, personType: type, page })}`);

  const reset = () => setPage(1);
  async function toggle(c: Row) {
    if (c.status === "ACTIVE") {
      const r = await confirm({
        title: "Desativar cliente?", danger: true, confirmLabel: "Desativar",
        message: <>O cliente <b>{c.name}</b> deixará de aparecer nas listas ativas e não poderá receber novos empreendimentos. Os dados são mantidos e ele pode ser reativado depois.</>,
      });
      if (!r.ok) return;
      await run(() => api(`/api/clients/${c.id}/deactivate`, { method: "POST" }), "Cliente desativado.");
    } else {
      await run(() => api(`/api/clients/${c.id}/reactivate`, { method: "POST" }), "Cliente reativado.");
    }
    reload();
  }

  return (
    <>
      <div className="pagehead">
        <div><h1>Clientes</h1><p className="meta">Proprietários, condomínios e empresas responsáveis pelos empreendimentos.</p></div>
        {can.write && <Link href="/clientes/novo" className="btn btn-primary">Novo cliente</Link>}
      </div>
      <div className="toolbar" role="search">
        <div className="grow"><TextField label="Buscar" name="q" value={q} onChange={(v) => { setQ(v); reset(); }} placeholder="Nome, nome fantasia ou CPF/CNPJ" /></div>
        <SelectField label="Tipo" name="type" value={type} onChange={(v) => { setType(v); reset(); }} placeholder="Todos" options={opts(personTypeLabels)} />
        <SelectField label="Situação" name="status" value={status} onChange={(v) => { setStatus(v); reset(); }} options={[["ACTIVE", "Ativos"], ["INACTIVE", "Inativos"], ["ALL", "Todos"]]} />
      </div>
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : !data?.items.length ? (
        <Empty title={dq || type || status !== "ACTIVE" ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
          action={can.write && !dq && !type ? <Link className="btn btn-primary" href="/clientes/novo">Cadastrar primeiro cliente</Link> : undefined}>
          {dq || type || status !== "ACTIVE" ? "Ajuste a busca ou os filtros." : "Cadastre um cliente para poder criar empreendimentos."}
        </Empty>
      ) : (
        <div style={{ opacity: loading ? 0.6 : 1 }} aria-busy={loading}>
          <div className="tablewrap">
            <table className="t stack">
              <thead><tr><th>Nome</th><th>Documento</th><th>Contato</th><th>Cidade</th><th className="num">Empreend.</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id}>
                    <td className="first"><Link className="name" href={`/clientes/${c.id}`}>{c.name}</Link><div className="sub">{personTypeLabels[c.personType]}{c.tradeName ? ` · ${c.tradeName}` : ""}</div></td>
                    <td data-label="Documento" className="mono">{c.document ? (c.masked ? c.document : formatDocument(c.document)) : <span className="none">—</span>}</td>
                    <td data-label="Contato">{c.email || c.phone ? <>{c.email}<div className="sub">{c.masked ? c.phone : formatPhone(c.phone)}</div></> : <span className="none">—</span>}</td>
                    <td data-label="Cidade">{c.city ? `${c.city}${c.state ? `/${c.state}` : ""}` : <span className="none">—</span>}</td>
                    <td data-label="Empreend." className="num">{c.projectCount}</td>
                    <td data-label="Situação"><StatusBadge status={c.status} /></td>
                    <td className="acts"><div className="rowact">
                      <Link className="btn btn-quiet btn-sm" href={`/clientes/${c.id}`}>{can.write ? "Editar" : "Ver"}</Link>
                      {can.admin && <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => toggle(c)}>{c.status === "ACTIVE" ? "Desativar" : "Reativar"}</button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </div>
      )}
    </>
  );
}

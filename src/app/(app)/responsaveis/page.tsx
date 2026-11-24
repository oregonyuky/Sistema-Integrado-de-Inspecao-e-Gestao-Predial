"use client";
import { useState } from "react";
import { api } from "@/ui/api";
import { ResponsibleModal, type Resp } from "@/components/ResponsibleModals";
import { Empty, ErrorBox, Loading, SelectField, StatusBadge, TextField, useAction, useCan, useConfirm, useDebounced, useFetch } from "@/ui/kit";
import { formatPhone } from "@/lib/format";

export default function ResponsiblesRegistry() {
  const can = useCan(); const confirm = useConfirm(); const { busy, run } = useAction();
  const [q, setQ] = useState(""); const [status, setStatus] = useState("ACTIVE"); const dq = useDebounced(q);
  const { data, error, loading, reload } = useFetch<Resp[]>(`/api/responsibles?status=${status}${dq ? `&q=${encodeURIComponent(dq)}` : ""}`);
  const [modal, setModal] = useState<Resp | null | undefined>(undefined);

  async function toggle(r: Resp) {
    if (r.status === "ACTIVE") {
      const c = await confirm({ title: "Desativar responsável?", danger: true, confirmLabel: "Desativar", message: <><b>{r.name}</b> não poderá receber novos vínculos. Vínculos existentes e o histórico são mantidos.</> });
      if (!c.ok) return;
    }
    await run(() => api(`/api/responsibles/${r.id}/status`, { body: { status: r.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } }), r.status === "ACTIVE" ? "Responsável desativado." : "Responsável reativado.");
    reload();
  }
  return (
    <>
      <div className="pagehead"><div><h1>Responsáveis</h1><p className="meta">Cadastro de pessoas e empresas que podem ser vinculadas aos empreendimentos. Os vínculos e períodos são geridos dentro de cada empreendimento.</p></div>
        {can.write && <button className="btn btn-primary" onClick={() => setModal(null)}>Novo responsável</button>}</div>
      <div className="toolbar" role="search">
        <div className="grow"><TextField label="Buscar" name="q" value={q} onChange={setQ} placeholder="Nome ou empresa" /></div>
        <SelectField label="Situação" name="st" value={status} onChange={setStatus} options={[["ACTIVE", "Ativos"], ["INACTIVE", "Inativos"], ["ALL", "Todos"]]} />
      </div>
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : !data?.length ? <Empty title="Nenhum responsável encontrado">Cadastre responsáveis aqui ou diretamente ao vinculá-los a um empreendimento.</Empty> : (
        <div className="tablewrap"><table className="t stack">
          <thead><tr><th>Nome</th><th>Contato</th><th className="num">Vínculos</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{data.map((r) => (
            <tr key={r.id}>
              <td className="first"><span className="name">{r.name}</span><div className="sub">{r.companyName}{r.professionalRegistration ? ` · ${r.professionalRegistration}` : ""}</div></td>
              <td data-label="Contato">{r.email || r.phone ? <>{r.email}<div className="sub">{r.masked ? r.phone : formatPhone(r.phone)}</div></> : <span className="none">—</span>}</td>
              <td data-label="Vínculos" className="num">{r.assignmentCount}</td>
              <td data-label="Situação"><StatusBadge status={r.status} /></td>
              <td className="acts"><div className="rowact">
                {can.write && <button className="btn btn-quiet btn-sm" onClick={() => setModal(r)}>Editar</button>}
                {can.write && <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => toggle(r)}>{r.status === "ACTIVE" ? "Desativar" : "Reativar"}</button>}
              </div></td>
            </tr>))}</tbody>
        </table></div>
      )}
      <ResponsibleModal resp={modal} onClose={() => setModal(undefined)} onSaved={() => { setModal(undefined); reload(); }} />
    </>
  );
}

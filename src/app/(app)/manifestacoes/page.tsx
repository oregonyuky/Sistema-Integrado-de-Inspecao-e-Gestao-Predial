"use client";
import { useState } from "react";
import { api, qs } from "@/ui/api";
import { FormModal, type Field, type FormState } from "@/components/FormModal";
import { Empty, ErrorBox, Loading, StatusBadge, TextField, opts, useAction, useCan, useDebounced, useFetch } from "@/ui/kit";
import { classificationKindLabels } from "@/lib/labels";

type Cls = { id: string; code: string; name: string; kind: keyof typeof classificationKindLabels; description: string | null; status: "ACTIVE" | "INACTIVE" };
type Man = { id: string; code: string; name: string; description: string | null; typicalCauses: string | null; status: "ACTIVE" | "INACTIVE"; classifications: Cls[] };
const str = (x: unknown) => (x === null || x === undefined ? "" : String(x));

export default function ManifestationsPage() {
  const can = useCan(); const { busy, run } = useAction();
  const [tab, setTab] = useState<"man" | "cls">("man");
  const [q, setQ] = useState(""); const dq = useDebounced(q); const [inactive, setInactive] = useState(false);
  const st = inactive ? undefined : "ACTIVE";
  const mans = useFetch<Man[]>(`/api/manifestations${qs({ q: dq, status: st })}`);
  const clss = useFetch<Cls[]>(`/api/classifications${qs({ status: inactive ? undefined : "ACTIVE" })}`);
  const allActive = useFetch<Cls[]>("/api/classifications?status=ACTIVE");
  const [state, setState] = useState<FormState>(undefined);

  const manFields: Field[] = [
    { name: "code", label: "Código", required: true, maxLength: 40, span: 4 },
    { name: "name", label: "Nome da manifestação", required: true, maxLength: 200, span: 8, hint: "Ex.: Fissura, corrosão, infiltração" },
    { name: "description", label: "Descrição", kind: "area", maxLength: 4000 },
    { name: "typicalCauses", label: "Causas típicas", kind: "area", maxLength: 4000 },
    { name: "classificationIds", label: "Classificações aplicáveis", kind: "multi", options: (allActive.data ?? []).map((c) => [c.id, `${classificationKindLabels[c.kind]} — ${c.name}`]) },
  ];
  const clsFields: Field[] = [
    { name: "code", label: "Código", required: true, maxLength: 40, span: 4 },
    { name: "kind", label: "Dimensão", kind: "select", required: true, options: opts(classificationKindLabels), span: 8 },
    { name: "name", label: "Nome", required: true, maxLength: 200 },
    { name: "description", label: "Descrição", kind: "area", maxLength: 4000 },
  ];
  const reloadAll = () => { mans.reload(); clss.reload(); allActive.reload(); };
  const base = tab === "man" ? "manifestations" : "classifications";
  const toggle = async (id: string, active: boolean) => { await run(() => api(`/api/${base}/${id}/${active ? "deactivate" : "reactivate"}`, { method: "POST" }), active ? "Desativado." : "Reativado."); reloadAll(); };
  const submit = (v: Record<string, string | boolean | string[]>, id?: string) => id ? api(`/api/${base}/${id}`, { method: "PUT", body: v }) : api(`/api/${base}`, { body: v });
  const list = tab === "man" ? mans : clss;

  return (
    <>
      <div className="pagehead"><div><h1>Manifestações e classificações</h1><p className="meta">Biblioteca de manifestações patológicas (o que se observa) e de classificações técnicas (como se qualifica: gravidade, origem, risco, urgência). São cadastros distintos que podem ser relacionados.</p></div>
        {can.write && <button className="btn btn-primary" onClick={() => setState(tab === "man" ? { values: { code: "", name: "", description: "", typicalCauses: "", classificationIds: [] } } : { values: { code: "", kind: "", name: "", description: "" } })}>{tab === "man" ? "Nova manifestação" : "Nova classificação"}</button>}</div>
      <nav className="tabs" aria-label="Biblioteca">
        <button type="button" aria-selected={tab === "man"} onClick={() => setTab("man")}>Manifestações</button>
        <button type="button" aria-selected={tab === "cls"} onClick={() => setTab("cls")}>Classificações técnicas</button>
      </nav>
      <div className="toolbar">
        {tab === "man" && <TextField label="Buscar" name="q" value={q} onChange={setQ} placeholder="Nome ou código" />}
        <label className="checkline"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Mostrar inativos</label>
      </div>
      {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty title="Nada cadastrado">{can.write ? "Use o botão no topo para cadastrar." : "Nenhum registro."}</Empty> : (
        <div className="tablewrap"><table className="t">
          {tab === "man" ? (<>
            <thead><tr><th>Código</th><th>Manifestação</th><th>Classificações</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{(mans.data ?? []).map((m) => (
              <tr key={m.id} style={m.status === "INACTIVE" ? { opacity: 0.65 } : undefined}>
                <td className="mono">{m.code}</td>
                <td><b>{m.name}</b>{m.description && <div className="sub muted">{m.description}</div>}{m.typicalCauses && <div className="sub muted">Causas: {m.typicalCauses}</div>}</td>
                <td>{m.classifications.length ? m.classifications.map((c) => <span key={c.id} className="badge badge-plain" style={{ marginRight: 4 }}>{c.name}</span>) : <span className="muted">—</span>}</td>
                <td><StatusBadge status={m.status} /></td>
                <td className="rowact">{can.write && <><button className="btn btn-quiet btn-sm" onClick={() => setState({ id: m.id, values: { code: m.code, name: m.name, description: str(m.description), typicalCauses: str(m.typicalCauses), classificationIds: m.classifications.map((c) => c.id) } })}>Editar</button>
                  <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => toggle(m.id, m.status === "ACTIVE")}>{m.status === "ACTIVE" ? "Desativar" : "Reativar"}</button></>}</td>
              </tr>))}</tbody></>) : (<>
            <thead><tr><th>Código</th><th>Dimensão</th><th>Classificação</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{(clss.data ?? []).map((c) => (
              <tr key={c.id} style={c.status === "INACTIVE" ? { opacity: 0.65 } : undefined}>
                <td className="mono">{c.code}</td><td>{classificationKindLabels[c.kind]}</td>
                <td><b>{c.name}</b>{c.description && <div className="sub muted">{c.description}</div>}</td><td><StatusBadge status={c.status} /></td>
                <td className="rowact">{can.write && <><button className="btn btn-quiet btn-sm" onClick={() => setState({ id: c.id, values: { code: c.code, kind: c.kind, name: c.name, description: str(c.description) } })}>Editar</button>
                  <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => toggle(c.id, c.status === "ACTIVE")}>{c.status === "ACTIVE" ? "Desativar" : "Reativar"}</button></>}</td>
              </tr>))}</tbody></>)}
        </table></div>)}
      <FormModal title={`${state?.id ? "Editar" : "Nova"} ${tab === "man" ? "manifestação" : "classificação"}`} fields={tab === "man" ? manFields : clsFields} state={state} okMsg="Salvo com sucesso."
        onClose={() => setState(undefined)} onSaved={() => { setState(undefined); reloadAll(); }} submit={submit} />
    </>
  );
}

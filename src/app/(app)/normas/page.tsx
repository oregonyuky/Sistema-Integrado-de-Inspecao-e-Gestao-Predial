"use client";
import { useState } from "react";
import { api } from "@/ui/api";
import { FormModal, type Field, type FormState } from "@/components/FormModal";
import { Empty, ErrorBox, Loading, StatusBadge, TextField, useAction, useCan, useDebounced, useFetch } from "@/ui/kit";
import { qs } from "@/ui/api";

type Section = { id: string; ref: string; title: string; summary: string | null; status: "ACTIVE" | "INACTIVE"; linkCount: number };
type Edition = { id: string; edition: string; publishedOn: string | null; isCurrent: boolean; notes: string | null; status: "ACTIVE" | "INACTIVE"; sections: Section[] };
type Norm = { id: string; code: string; title: string; issuer: string | null; description: string | null; status: "ACTIVE" | "INACTIVE"; editions: Edition[] };

const normFields: Field[] = [
  { name: "code", label: "Código da norma", required: true, maxLength: 60, span: 6, hint: "Ex.: ABNT NBR 5410" },
  { name: "issuer", label: "Órgão emissor", maxLength: 120, span: 6 },
  { name: "title", label: "Título", required: true, maxLength: 300 },
  { name: "description", label: "Descrição", kind: "area", maxLength: 4000 },
];
const edFields: Field[] = [
  { name: "edition", label: "Edição", required: true, maxLength: 60, span: 6, hint: "Ex.: 2004 ou 2ª edição" },
  { name: "publishedOn", label: "Publicada em", kind: "date", span: 6 },
  { name: "isCurrent", label: "Esta é a edição vigente (as demais deixam de ser vigentes)", kind: "check" },
  { name: "notes", label: "Observações", kind: "area", maxLength: 2000 },
];
const secFields: Field[] = [
  { name: "ref", label: "Seção / item", required: true, maxLength: 40, span: 4, hint: "Ex.: 6.5.4" },
  { name: "title", label: "Título", required: true, maxLength: 300, span: 8 },
  { name: "summary", label: "Resumo (texto próprio, não a transcrição da norma)", kind: "area", maxLength: 4000 },
];
const str = (x: unknown) => (x === null || x === undefined ? "" : String(x));

type Modal = { kind: "norm" | "edition" | "section"; parentId?: string; state: NonNullable<FormState> } | null;

export default function NormsPage() {
  const can = useCan(); const { busy, run } = useAction();
  const [q, setQ] = useState(""); const dq = useDebounced(q); const [inactive, setInactive] = useState(false);
  const { data, error, loading, reload } = useFetch<Norm[]>(`/api/norms${qs({ q: dq, status: inactive ? undefined : "ACTIVE" })}`);
  const [modal, setModal] = useState<Modal>(null);
  const [openN, setOpenN] = useState<Set<string>>(new Set());
  const tog = (id: string) => setOpenN((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const fields = modal?.kind === "norm" ? normFields : modal?.kind === "edition" ? edFields : secFields;
  const title = !modal ? "" : `${modal.state.id ? "Editar" : "Nova"} ${modal.kind === "norm" ? "norma" : modal.kind === "edition" ? "edição" : "seção"}`;
  async function submit(v: Record<string, string | boolean | string[]>, id?: string) {
    if (!modal) return;
    const base = modal.kind === "norm" ? "norms" : modal.kind === "edition" ? "norm-editions" : "norm-sections";
    if (id) return api(`/api/${base}/${id}`, { method: "PUT", body: v });
    const parent = modal.kind === "norm" ? "/api/norms" : modal.kind === "edition" ? `/api/norms/${modal.parentId}/editions` : `/api/norm-editions/${modal.parentId}/sections`;
    return api(parent, { body: v });
  }
  const status = (base: string, id: string, active: boolean) => async () => { await run(() => api(`/api/${base}/${id}/${active ? "deactivate" : "reactivate"}`, { method: "POST" }), active ? "Desativado." : "Reativado."); reload(); };

  return (
    <>
      <div className="pagehead"><div><h1>Normas técnicas</h1><p className="meta">Biblioteca de normas, suas edições e seções. As seções são vinculadas a sistemas, subsistemas e tipos no Catálogo técnico.</p></div>
        {can.write && <button className="btn btn-primary" onClick={() => setModal({ kind: "norm", state: { values: { code: "", issuer: "", title: "", description: "" } } })}>Nova norma</button>}</div>
      <div className="toolbar">
        <TextField label="Buscar" name="q" value={q} onChange={setQ} placeholder="Código ou título" />
        <label className="checkline"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Mostrar inativas</label>
      </div>
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : !data?.length ? <Empty title="Nenhuma norma cadastrada">{can.write ? "Cadastre uma norma e depois suas edições e seções." : "Nada por aqui ainda."}</Empty> : (
        <div className="stack">
          {data.map((n) => (
            <section key={n.id} className="panel" style={n.status === "INACTIVE" ? { opacity: 0.7 } : undefined}>
              <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0 }}>{n.code} <StatusBadge status={n.status} /></h2>
                  <div>{n.title}</div>
                  <div className="sub muted">{n.issuer ?? "Emissor não informado"} · {n.editions.length} edição(ões)</div>
                </div>
                <div className="actions">
                  <button className="btn btn-sm" aria-expanded={openN.has(n.id)} onClick={() => tog(n.id)}>{openN.has(n.id) ? "Recolher" : "Ver edições"}</button>
                  {can.write && <>
                    <button className="btn btn-sm" onClick={() => setModal({ kind: "norm", state: { id: n.id, values: { code: n.code, issuer: str(n.issuer), title: n.title, description: str(n.description) } } })}>Editar</button>
                    <button className="btn btn-sm" disabled={busy} onClick={status("norms", n.id, n.status === "ACTIVE")}>{n.status === "ACTIVE" ? "Desativar" : "Reativar"}</button>
                  </>}
                </div>
              </div>
              {openN.has(n.id) && (
                <div style={{ marginTop: 14 }}>
                  {n.editions.length === 0 && <p className="muted">Nenhuma edição cadastrada.</p>}
                  {n.editions.map((e) => (
                    <div key={e.id} style={{ borderTop: "1px solid var(--rule-2)", padding: "12px 0", opacity: e.status === "INACTIVE" ? 0.65 : 1 }}>
                      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
                        <div><b>Edição {e.edition}</b> {e.isCurrent && <span className="badge badge-ok">Vigente</span>} {e.status === "INACTIVE" && <span className="badge badge-off badge-plain">inativa</span>}
                          <div className="sub muted">{e.publishedOn ? `Publicada em ${new Date(e.publishedOn + "T00:00:00").toLocaleDateString("pt-BR")}` : "Data não informada"}{e.notes ? ` · ${e.notes}` : ""}</div></div>
                        {can.write && <div className="actions">
                          <button className="btn btn-sm" onClick={() => setModal({ kind: "section", parentId: e.id, state: { values: { ref: "", title: "", summary: "" } } })} disabled={e.status !== "ACTIVE"}>Nova seção</button>
                          <button className="btn btn-sm" onClick={() => setModal({ kind: "edition", state: { id: e.id, values: { edition: e.edition, publishedOn: str(e.publishedOn).slice(0, 10), isCurrent: e.isCurrent, notes: str(e.notes) } } })}>Editar</button>
                          <button className="btn btn-sm" disabled={busy} onClick={status("norm-editions", e.id, e.status === "ACTIVE")}>{e.status === "ACTIVE" ? "Desativar" : "Reativar"}</button>
                        </div>}
                      </div>
                      {e.sections.length > 0 && <div className="tablewrap" style={{ marginTop: 8 }}><table className="t"><thead><tr><th>Seção</th><th>Título</th><th>Vínculos</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>
                        {e.sections.map((s) => (
                          <tr key={s.id} style={s.status === "INACTIVE" ? { opacity: 0.6 } : undefined}>
                            <td className="mono">{s.ref}</td><td>{s.title}{s.summary && <div className="sub muted">{s.summary}</div>}</td><td>{s.linkCount}</td>
                            <td className="rowact">{can.write && <><button className="btn btn-quiet btn-sm" onClick={() => setModal({ kind: "section", state: { id: s.id, values: { ref: s.ref, title: s.title, summary: str(s.summary) } } })}>Editar</button>
                              <button className="btn btn-quiet btn-sm" disabled={busy} onClick={status("norm-sections", s.id, s.status === "ACTIVE")}>{s.status === "ACTIVE" ? "Desativar" : "Reativar"}</button></>}</td>
                          </tr>))}
                      </tbody></table></div>}
                    </div>))}
                  {can.write && n.status === "ACTIVE" && <button className="btn btn-sm btn-primary" onClick={() => setModal({ kind: "edition", parentId: n.id, state: { values: { edition: "", publishedOn: "", isCurrent: n.editions.length === 0, notes: "" } } })}>Nova edição</button>}
                </div>)}
            </section>))}
        </div>)}
      <FormModal title={title} fields={fields} state={modal?.state} okMsg="Salvo com sucesso." wide={false}
        onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} submit={submit} />
    </>
  );
}

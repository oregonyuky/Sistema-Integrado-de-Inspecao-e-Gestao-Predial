"use client";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, qs } from "@/ui/api";
import { useProject } from "@/components/ProjectContext";
import { Empty, ErrorBox, Loading, Modal, SelectField, TextArea, TextField, opts, useAction, useCan, useConfirm, useFetch, useToast } from "@/ui/kit";
import { historyCategoryLabels } from "@/lib/labels";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";

type Att = { id: string; fileName: string; mimeType: string; sizeBytes: number };
type Entry = { id: string; category: keyof typeof historyCategoryLabels; title: string; description: string | null; occurredOn: string; recordedAt: string; recordedBy: { name: string } | null; notes: string | null; sourceType: string | null; status: "ACTIVE" | "INACTIVE"; voidReason: string | null; attachments: Att[] };
const R = "Campo obrigatório.";

function EntryModal({ projectId, state, onClose, onSaved }: { projectId: string; state: Entry | null | undefined; onClose: () => void; onSaved: () => void }) {
  const open = state !== undefined; const edit = state ?? null; const toast = useToast();
  const [v, setV] = useState<Record<string, string>>({}); const [files, setFiles] = useState<File[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({}); const [top, setTop] = useState(""); const [busy, setBusy] = useState(false);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  useEffect(() => {
    if (!open) return;
    setV({ category: edit?.category ?? "", title: edit?.title ?? "", description: edit?.description ?? "", occurredOn: edit?.occurredOn ?? today, notes: edit?.notes ?? "" });
    setFiles([]); setErrs({}); setTop(""); setBusy(false);
    /* eslint-disable-next-line */
  }, [open]);
  const set = (k: string) => (x: string) => { setV((o) => ({ ...o, [k]: x })); setErrs((o) => ({ ...o, [k]: "" })); };

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const er: Record<string, string> = {};
    if (!v.category) er.category = "Selecione a categoria."; if (!v.title?.trim()) er.title = R; if (!v.occurredOn) er.occurredOn = R;
    setErrs(er); if (Object.keys(er).length) return setTop("Revise os campos destacados.");
    setBusy(true); setTop("");
    try {
      const saved = edit ? await api<Entry>(`/api/history/${edit.id}`, { method: "PUT", body: v }) : await api<Entry>(`/api/projects/${projectId}/history`, { body: v });
      const failed: string[] = [];
      for (const f of files) {
        const fd = new FormData(); fd.append("file", f);
        try { await api(`/api/history/${saved.id}/attachments`, { form: fd }); } catch (x) { failed.push(`${f.name}: ${x instanceof ApiError ? x.message : "falha no envio"}`); }
      }
      if (failed.length) { toast.bad(`Registro salvo, mas alguns anexos falharam — ${failed.join("; ")}`); }
      else toast.ok(edit ? "Registro atualizado." : "Registro adicionado ao histórico.");
      onSaved();
    } catch (x) { if (x instanceof ApiError) { setErrs(x.fields); setTop(x.message); } else setTop("Não foi possível salvar."); setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={edit ? "Editar registro" : "Novo registro de histórico"} onSubmit={submit} wide
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button></>}>
      {top && <div className="alert alert-bad" role="alert" style={{ marginBottom: 12 }}>{top}</div>}
      <div className="grid">
        <div className="c6"><SelectField label="Categoria" name="category" required value={v.category ?? ""} onChange={set("category")} error={errs.category} placeholder="Selecione" options={opts(historyCategoryLabels)} /></div>
        <div className="c6"><TextField label="Data do acontecimento" name="occurredOn" type="date" required value={v.occurredOn ?? ""} onChange={set("occurredOn")} error={errs.occurredOn} /></div>
        <div style={{ gridColumn: "span 12" }}><TextField label="Título" name="title" required value={v.title ?? ""} onChange={set("title")} error={errs.title} maxLength={200} /></div>
        <div style={{ gridColumn: "span 12" }}><TextArea label="Descrição" name="description" value={v.description ?? ""} onChange={set("description")} error={errs.description} maxLength={8000} /></div>
        <div style={{ gridColumn: "span 12" }}><TextArea label="Observações" name="notes" value={v.notes ?? ""} onChange={set("notes")} error={errs.notes} maxLength={4000} /></div>
        <div className="field" style={{ gridColumn: "span 12" }}>
          <label htmlFor="files">Anexos</label>
          <input id="files" type="file" multiple className="input" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          <span className="hint">PDF, imagens, planilhas e documentos de texto; até 15 MB por arquivo.{edit ? " Os novos arquivos são somados aos já anexados." : ""}</span>
        </div>
      </div>
    </Modal>
  );
}

export default function HistoryTab() {
  const { project } = useProject(); const can = useCan(); const confirm = useConfirm(); const { busy, run } = useAction();
  const editable = can.write && project.status === "ACTIVE";
  const [f, setF] = useState({ category: "", from: "", to: "", order: "desc", includeVoided: "" });
  const { data, error, loading, reload } = useFetch<Entry[]>(`/api/projects/${project.id}/history${qs({ category: f.category, from: f.from, to: f.to, order: f.order, includeVoided: f.includeVoided })}`);
  const [modal, setModal] = useState<Entry | null | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null); const [attachTo, setAttachTo] = useState<string | null>(null);
  const set = (k: string) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  const filtered = !!(f.category || f.from || f.to);
  const badRange = f.from && f.to && f.to < f.from;

  async function voidEntry(e: Entry) {
    const r = await confirm({ title: "Anular registro?", danger: true, confirmLabel: "Anular", reasonLabel: "Motivo da anulação",
      message: <>O registro <b>{e.title}</b> não será apagado: ficará marcado como anulado, com o motivo, e poderá ser restaurado.</> });
    if (!r.ok) return;
    await run(() => api(`/api/history/${e.id}/void`, { body: { reason: r.reason } }), "Registro anulado."); reload();
  }
  async function removeAtt(a: Att) {
    const r = await confirm({ title: "Remover anexo?", danger: true, confirmLabel: "Remover", message: <>O arquivo <b>{a.fileName}</b> será removido deste registro.</> });
    if (!r.ok) return;
    await run(() => api(`/api/attachments/${a.id}`, { method: "DELETE" }), "Anexo removido."); reload();
  }
  async function upload(file: File | undefined) {
    const id = attachTo; setAttachTo(null);
    if (!file || !id) return;
    const fd = new FormData(); fd.append("file", file);
    await run(() => api(`/api/history/${id}/attachments`, { form: fd }), "Anexo adicionado."); reload();
  }

  return (
    <>
      <div className="toolbar" role="search">
        <SelectField label="Categoria" name="cat" value={f.category} onChange={set("category")} placeholder="Todas" options={opts(historyCategoryLabels)} />
        <TextField label="De" name="from" type="date" value={f.from} onChange={set("from")} />
        <TextField label="Até" name="to" type="date" value={f.to} onChange={set("to")} error={badRange ? "Anterior ao início." : undefined} />
        <SelectField label="Ordem" name="ord" value={f.order} onChange={set("order")} options={[["desc", "Mais recentes primeiro"], ["asc", "Mais antigos primeiro"]]} />
        <label className="checkline"><input type="checkbox" checked={!!f.includeVoided} onChange={(e) => set("includeVoided")(e.target.checked ? "true" : "")} /> Incluir anulados</label>
        {filtered && <button className="btn btn-sm" onClick={() => setF({ ...f, category: "", from: "", to: "" })}>Limpar filtros</button>}
        {editable && <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setModal(null)}>Novo registro</button>}
      </div>
      <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
      {badRange ? <div className="alert alert-warn">A data final é anterior à data inicial.</div> : error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : !data?.length ? (
        <Empty title={filtered ? "Nenhum registro no filtro" : "Histórico vazio"} action={editable && !filtered ? <button className="btn btn-primary" onClick={() => setModal(null)}>Registrar primeiro evento</button> : undefined}>
          {filtered ? "Ajuste a categoria ou o período." : "Construção, reformas, ampliações e ocorrências relevantes aparecem aqui em ordem cronológica."}
        </Empty>
      ) : (
        <ol className="timeline" style={{ opacity: loading ? 0.6 : 1 }} aria-busy={loading}>
          {data.map((e) => (
            <li key={e.id} className={`tl${e.status === "INACTIVE" ? " void" : ""}`}>
              <div className="when">{formatDate(e.occurredOn)}</div>
              <div className="spine"><i /></div>
              <div className="what">
                <div className="cat">{historyCategoryLabels[e.category]}{e.sourceType ? ` · origem: ${e.sourceType}` : ""}</div>
                <h3>{e.title}</h3>
                {e.status === "INACTIVE" && <p className="alert alert-warn" style={{ marginTop: 6 }}><b>Anulado.</b> {e.voidReason}</p>}
                {e.description && <p className="desc">{e.description}</p>}
                {e.notes && <p className="desc muted">Obs.: {e.notes}</p>}
                {e.attachments.length > 0 && (
                  <ul className="files" aria-label="Anexos">{e.attachments.map((a) => (
                    <li key={a.id}><a href={`/api/attachments/${a.id}`} download={a.fileName}>{a.fileName} <span className="muted">({formatBytes(a.sizeBytes)})</span></a>
                      {editable && e.status === "ACTIVE" && <button aria-label={`Remover anexo ${a.fileName}`} onClick={() => removeAtt(a)}>✕</button>}</li>))}</ul>)}
                <div className="foot">
                  <span>Registrado em {formatDateTime(e.recordedAt)}{e.recordedBy ? ` por ${e.recordedBy.name}` : ""}</span>
                  {editable && e.status === "ACTIVE" && <>
                    <button className="btn btn-quiet btn-sm" onClick={() => setModal(e)}>Editar</button>
                    <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => { setAttachTo(e.id); fileRef.current?.click(); }}>Anexar arquivo</button>
                    <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => voidEntry(e)}>Anular</button></>}
                  {editable && e.status === "INACTIVE" && <button className="btn btn-quiet btn-sm" disabled={busy} onClick={async () => { await run(() => api(`/api/history/${e.id}/restore`, { method: "POST" }), "Registro restaurado."); reload(); }}>Restaurar</button>}
                </div>
              </div>
            </li>))}
        </ol>
      )}
      <EntryModal projectId={project.id} state={modal} onClose={() => setModal(undefined)} onSaved={() => { setModal(undefined); reload(); }} />
    </>
  );
}

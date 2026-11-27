"use client";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError, qs } from "@/ui/api";
import { Modal, SelectField, TextArea, TextField, opts, useDebounced, useFetch, useToast } from "@/ui/kit";
import { catalogKindLabels, criterionResponseLabels } from "@/lib/labels";
import type { CatItem, Criterion } from "./catalog-types";

const s = (x: unknown) => (x === null || x === undefined ? "" : String(x));
const R = "Campo obrigatório.";

/* ───────── item do catálogo (criar / editar / mover) ───────── */
export type ItemModalState = undefined | { mode: "create"; kind: CatItem["kind"]; parentId: string | null } | { mode: "edit"; item: CatItem };

export function CatalogItemModal({ items, state, onClose, onSaved }: { items: CatItem[]; state: ItemModalState; onClose: () => void; onSaved: (id: string) => void }) {
  const open = !!state; const toast = useToast();
  const kind = state ? (state.mode === "create" ? state.kind : state.item.kind) : "SYSTEM";
  const edit = state?.mode === "edit" ? state.item : null;
  const [v, setV] = useState<Record<string, string>>({}); const [errs, setErrs] = useState<Record<string, string>>({});
  const [top, setTop] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!state) return;
    setErrs({}); setTop(""); setBusy(false);
    setV(state.mode === "edit"
      ? { code: state.item.code, name: state.item.name, description: s(state.item.description), parentId: s(state.item.parentId) }
      : { code: "", name: "", description: "", parentId: s(state.parentId) });
    /* eslint-disable-next-line */
  }, [state]);
  const set = (k: string) => (x: string) => { setV((o) => ({ ...o, [k]: x })); setErrs((o) => ({ ...o, [k]: "" })); };
  const parentOptions = useMemo<[string, string][]>(() => {
    const allowed = kind === "SUBSYSTEM" ? ["SYSTEM"] : kind === "TYPE" ? ["SYSTEM", "SUBSYSTEM"] : [];
    const label = (i: CatItem): string => { const p = items.find((x) => x.id === i.parentId); return `${p ? `${label(p)} › ` : ""}${i.name}`; };
    return items.filter((i) => allowed.includes(i.kind) && (i.status === "ACTIVE" || i.id === edit?.parentId)).map((i) => [i.id, label(i)]);
  }, [items, kind, edit?.parentId]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const er: Record<string, string> = {};
    if (!v.code?.trim()) er.code = R; if (!v.name?.trim()) er.name = R; if (kind !== "SYSTEM" && !v.parentId) er.parentId = R;
    setErrs(er); if (Object.keys(er).length) return setTop("Revise os campos destacados.");
    setBusy(true); setTop("");
    const body = { kind, parentId: kind === "SYSTEM" ? null : v.parentId, code: v.code, name: v.name, description: v.description };
    try {
      const r = edit ? await api<{ id: string }>(`/api/catalog/${edit.id}`, { method: "PUT", body }) : await api<{ id: string }>("/api/catalog", { body });
      toast.ok(edit ? "Item atualizado." : "Item criado."); onSaved(r.id);
    } catch (x) { if (x instanceof ApiError) { setErrs(x.fields); setTop(x.message); } else setTop("Não foi possível salvar."); setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={`${edit ? "Editar" : "Novo"} ${catalogKindLabels[kind].toLowerCase()}`} onSubmit={submit}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button></>}>
      {top && <div className="alert alert-bad" role="alert" style={{ marginBottom: 12 }}>{top}</div>}
      <div className="grid">
        {kind !== "SYSTEM" && <div style={{ gridColumn: "span 12" }}><SelectField label={kind === "SUBSYSTEM" ? "Sistema" : "Dentro de"} name="parentId" required value={v.parentId ?? ""} onChange={set("parentId")} error={errs.parentId} placeholder="Selecione" options={parentOptions}
          hint={edit ? "Alterar o local move o item sem perder seus vínculos." : undefined} /></div>}
        <div className="c4"><TextField label="Código" name="code" required value={v.code ?? ""} onChange={set("code")} error={errs.code} maxLength={40} hint="Único no catálogo. Ex.: ELE.QD" autoFocus /></div>
        <div className="c8"><TextField label="Nome" name="name" required value={v.name ?? ""} onChange={set("name")} error={errs.name} maxLength={200} /></div>
        <div style={{ gridColumn: "span 12" }}><TextArea label="Descrição" name="description" value={v.description ?? ""} onChange={set("description")} error={errs.description} maxLength={4000} /></div>
      </div>
    </Modal>
  );
}

/* ───────── critério de inspeção ───────── */
export function CriterionModal({ typeId, state, onClose, onSaved }: { typeId: string; state: Criterion | null | undefined; onClose: () => void; onSaved: () => void }) {
  const open = state !== undefined; const edit = state ?? null; const toast = useToast();
  const [v, setV] = useState<Record<string, string>>({}); const [req, setReq] = useState(true);
  const [errs, setErrs] = useState<Record<string, string>>({}); const [top, setTop] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErrs({}); setTop(""); setBusy(false); setReq(edit?.required ?? true);
    setV({ code: s(edit?.code), label: s(edit?.label), description: s(edit?.description), responseType: s(edit?.responseType) || "PASS_FAIL", unit: s(edit?.unit), minValue: s(edit?.minValue), maxValue: s(edit?.maxValue), options: (edit?.options ?? []).join("\n") });
    /* eslint-disable-next-line */
  }, [open]);
  const set = (k: string) => (x: string) => { setV((o) => ({ ...o, [k]: x })); setErrs((o) => ({ ...o, [k]: "" })); };
  const t = v.responseType;
  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const er: Record<string, string> = {};
    if (!v.code?.trim()) er.code = R; if (!v.label?.trim()) er.label = R;
    const options = (v.options ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
    if (t === "SINGLE_CHOICE" && options.length < 2) er.options = "Informe ao menos duas opções (uma por linha).";
    if (t === "NUMBER" && v.minValue && v.maxValue && Number(v.minValue.replace(",", ".")) > Number(v.maxValue.replace(",", "."))) er.maxValue = "O máximo não pode ser menor que o mínimo.";
    setErrs(er); if (Object.keys(er).length) return setTop("Revise os campos destacados.");
    setBusy(true); setTop("");
    const body = {
      code: v.code, label: v.label, description: v.description, responseType: t, required: req,
      unit: t === "NUMBER" ? v.unit : null, minValue: t === "NUMBER" ? v.minValue : null, maxValue: t === "NUMBER" ? v.maxValue : null, options: t === "SINGLE_CHOICE" ? options : [],
    };
    try {
      if (edit) await api(`/api/criteria/${edit.id}`, { method: "PUT", body }); else await api(`/api/catalog/${typeId}/criteria`, { body });
      toast.ok(edit ? "Critério atualizado." : "Critério adicionado."); onSaved();
    } catch (x) { if (x instanceof ApiError) { setErrs(x.fields); setTop(x.message); } else setTop("Não foi possível salvar."); setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={edit ? "Editar critério" : "Novo critério de inspeção"} onSubmit={submit} wide
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button></>}>
      {top && <div className="alert alert-bad" role="alert" style={{ marginBottom: 12 }}>{top}</div>}
      <div className="grid">
        <div className="c4"><TextField label="Código" name="code" required value={v.code ?? ""} onChange={set("code")} error={errs.code} maxLength={40} autoFocus /></div>
        <div className="c8"><TextField label="Pergunta / item verificado" name="label" required value={v.label ?? ""} onChange={set("label")} error={errs.label} maxLength={300} /></div>
        <div className="c6"><SelectField label="Tipo de resposta" name="responseType" required value={t ?? ""} onChange={set("responseType")} error={errs.responseType} options={opts(criterionResponseLabels)} /></div>
        <div className="c6"><label className="checkline" style={{ marginTop: 26 }}><input type="checkbox" checked={req} onChange={(e) => setReq(e.target.checked)} /> Resposta obrigatória na inspeção</label></div>
        {t === "NUMBER" && (<>
          <div className="c4"><TextField label="Unidade" name="unit" value={v.unit ?? ""} onChange={set("unit")} error={errs.unit} maxLength={30} hint="Ex.: °C, bar, mm" /></div>
          <div className="c4"><TextField label="Mínimo aceitável" name="minValue" value={v.minValue ?? ""} onChange={set("minValue")} error={errs.minValue} inputMode="decimal" /></div>
          <div className="c4"><TextField label="Máximo aceitável" name="maxValue" value={v.maxValue ?? ""} onChange={set("maxValue")} error={errs.maxValue} inputMode="decimal" /></div>
        </>)}
        {t === "SINGLE_CHOICE" && <div style={{ gridColumn: "span 12" }}><TextArea label="Opções de resposta" name="options" required value={v.options ?? ""} onChange={set("options")} error={errs.options} hint="Uma opção por linha (mínimo 2)." /></div>}
        <div style={{ gridColumn: "span 12" }}><TextArea label="Orientação ao inspetor" name="description" value={v.description ?? ""} onChange={set("description")} error={errs.description} maxLength={2000} /></div>
      </div>
    </Modal>
  );
}

/* ───────── vincular seção de norma ───────── */
type Sec = { id: string; ref: string; title: string; edition: string; normCode: string; normTitle: string };
export function NormLinkModal({ itemId, open, onClose, onSaved }: { itemId: string; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const { data, loading } = useFetch<Sec[]>(open ? `/api/norms/sections${qs({ q: dq })}` : null);
  const [sel, setSel] = useState(""); const [notes, setNotes] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setQ(""); setSel(""); setNotes(""); setErr(""); setBusy(false); } }, [open]);
  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!sel) return setErr("Selecione uma seção.");
    setBusy(true); setErr("");
    try { await api(`/api/catalog/${itemId}/norms`, { body: { sectionId: sel, notes } }); toast.ok("Norma vinculada."); onSaved(); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Não foi possível vincular."); setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Vincular norma ao item" onSubmit={submit} wide
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy}>{busy ? "Vinculando…" : "Vincular"}</button></>}>
      {err && <div className="alert alert-bad" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <TextField label="Buscar seção" name="q" value={q} onChange={setQ} placeholder="Código da norma, número ou título da seção" autoFocus />
      <div className="tablewrap" style={{ marginTop: 12, maxHeight: 280, overflow: "auto" }} role="radiogroup" aria-label="Seções disponíveis">
        {loading && !data ? <p className="muted" style={{ padding: 14 }}>Carregando…</p> : !data?.length ? <p className="muted" style={{ padding: 14 }}>Nenhuma seção ativa encontrada. Cadastre normas, edições e seções na tela Normas.</p> : (
          <table className="t"><tbody>{data.map((x) => (
            <tr key={x.id} onClick={() => setSel(x.id)} style={{ cursor: "pointer", background: sel === x.id ? "var(--steel-tint)" : undefined }}>
              <td style={{ width: 28 }}><input type="radio" name="sec" checked={sel === x.id} onChange={() => setSel(x.id)} aria-label={`${x.normCode} ${x.ref}`} /></td>
              <td><b>{x.normCode}</b> <span className="muted">· ed. {x.edition}</span><div className="sub">{x.ref} — {x.title}</div></td>
            </tr>))}</tbody></table>
        )}
      </div>
      <div style={{ marginTop: 12 }}><TextField label="Observação do vínculo" name="notes" value={notes} onChange={setNotes} maxLength={1000} /></div>
    </Modal>
  );
}

"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/ui/api";
import { Modal, SelectField, TextArea, TextField, opts, useFetch, useToast } from "@/ui/kit";
import { responsibleRoleLabels } from "@/lib/labels";
import { formatPhone } from "@/lib/format";

export type Resp = { id: string; name: string; companyName: string | null; email: string | null; phone: string | null; professionalRegistration: string | null; notes: string | null; status: "ACTIVE" | "INACTIVE"; masked: boolean; assignmentCount?: number };
export type Assign = { id: string; responsibleId: string; role: keyof typeof responsibleRoleLabels; roleDetail: string | null; startDate: string; endDate: string | null; current: boolean; notes: string | null; responsible: Resp };
const s = (x: unknown) => (x === null || x === undefined ? "" : String(x));
const R = "Campo obrigatório.";
const PK = ["name", "companyName", "email", "phone", "professionalRegistration", "notes"] as const;

function PersonFields({ v, set, errs, prefix = "", readOnlyMasked }: { v: Record<string, string>; set: (k: string) => (x: string) => void; errs: Record<string, string>; prefix?: string; readOnlyMasked?: boolean }) {
  const e = (k: string) => errs[`${prefix}${k}`] || errs[k];
  return (
    <div className="grid">
      <div className="c6"><TextField label="Nome" name="name" required value={v.name} onChange={set("name")} error={e("name")} maxLength={200} /></div>
      <div className="c6"><TextField label="Empresa / administradora" name="companyName" value={v.companyName} onChange={set("companyName")} error={e("companyName")} maxLength={200} /></div>
      <div className="c6"><TextField label="E-mail" name="email" type="email" value={v.email} onChange={set("email")} error={e("email")} disabled={readOnlyMasked} /></div>
      <div className="c6"><TextField label="Telefone" name="phone" type="tel" value={v.phone} onChange={set("phone")} error={e("phone")} hint="Com DDD." disabled={readOnlyMasked} /></div>
      <div className="c6"><TextField label="Registro profissional" name="professionalRegistration" value={v.professionalRegistration} onChange={set("professionalRegistration")} error={e("professionalRegistration")} hint="Ex.: CREA, CAU" /></div>
      <div style={{ gridColumn: "span 12" }}><TextArea label="Observações" name="notes" value={v.notes} onChange={set("notes")} error={e("notes")} maxLength={2000} /></div>
    </div>
  );
}
const blank = () => Object.fromEntries(PK.map((k) => [k, ""])) as Record<string, string>;
const fromResp = (r?: Resp | null) => { const o = blank(); if (r) for (const k of PK) o[k] = k === "phone" && !r.masked ? formatPhone(r.phone) : s(r[k]); return o; };
const personBody = (v: Record<string, string>) => ({ ...v });

/* ───────── cadastro/edição de pessoa (tela global) ───────── */
export function ResponsibleModal({ resp, onClose, onSaved }: { resp: Resp | null | undefined; onClose: () => void; onSaved: () => void }) {
  const open = resp !== undefined; const toast = useToast();
  const [v, setV] = useState(blank()); const [errs, setErrs] = useState<Record<string, string>>({}); const [top, setTop] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setV(fromResp(resp)); setErrs({}); setTop(""); setBusy(false); } /* eslint-disable-next-line */ }, [open]);
  const set = (k: string) => (x: string) => { setV((p) => ({ ...p, [k]: x })); setErrs((p) => ({ ...p, [k]: "" })); };
  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!v.name.trim()) { setErrs({ name: R }); return setTop("Revise os campos destacados."); }
    setBusy(true); setTop("");
    try {
      if (resp) await api(`/api/responsibles/${resp.id}`, { method: "PUT", body: personBody(v) }); else await api("/api/responsibles", { body: personBody(v) });
      toast.ok(resp ? "Responsável atualizado." : "Responsável cadastrado."); onSaved();
    } catch (x) { if (x instanceof ApiError) { setErrs(x.fields); setTop(x.message); } setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={resp ? "Editar responsável" : "Novo responsável"} onSubmit={submit} wide
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button></>}>
      {top && <div className="alert alert-bad" role="alert" style={{ marginBottom: 12 }}>{top}</div>}
      {resp?.masked && <div className="alert alert-info" style={{ marginBottom: 12 }}>Dados de contato ocultos para o seu perfil.</div>}
      <p className="hint" style={{ marginBottom: 12 }}>Responsáveis são contatos cadastrados no empreendimento; não são usuários da plataforma.</p>
      <PersonFields v={v} set={set} errs={errs} />
    </Modal>
  );
}

/* ───────── vínculo ao empreendimento ───────── */
export function AssignmentModal({ projectId, state, onClose, onSaved }: { projectId: string; state: Assign | null | undefined; onClose: () => void; onSaved: () => void }) {
  const open = state !== undefined; const edit = state ?? null; const toast = useToast();
  const resps = useFetch<Resp[]>(open && !edit ? "/api/responsibles?status=ACTIVE" : null);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [v, setV] = useState<Record<string, string>>({}); const [p, setP] = useState(blank());
  const [errs, setErrs] = useState<Record<string, string>>({}); const [top, setTop] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setMode("existing"); setP(blank()); setErrs({}); setTop(""); setBusy(false);
    setV({ responsibleId: "", role: s(edit?.role), roleDetail: s(edit?.roleDetail), startDate: s(edit?.startDate), endDate: s(edit?.endDate), notes: s(edit?.notes) });
    /* eslint-disable-next-line */
  }, [open]);
  const set = (k: string) => (x: string) => { setV((o) => ({ ...o, [k]: x })); setErrs((o) => ({ ...o, [k]: "" })); };
  const setPerson = (k: string) => (x: string) => { setP((o) => ({ ...o, [k]: x })); setErrs((o) => ({ ...o, [`responsible.${k}`]: "", [k]: "" })); };

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const er: Record<string, string> = {};
    if (!edit && mode === "existing" && !v.responsibleId) er.responsibleId = "Selecione o responsável.";
    if (!edit && mode === "new" && !p.name.trim()) er["responsible.name"] = R;
    if (!v.role) er.role = "Selecione a função."; if (v.role === "OTHER" && !v.roleDetail.trim()) er.roleDetail = "Descreva a função.";
    if (!v.startDate) er.startDate = R;
    if (v.startDate && v.endDate && v.endDate < v.startDate) er.endDate = "O término não pode ser anterior ao início.";
    setErrs(er); if (Object.keys(er).length) return setTop("Revise os campos destacados.");
    setBusy(true); setTop("");
    const base = { role: v.role, roleDetail: v.roleDetail, startDate: v.startDate, endDate: v.endDate, notes: v.notes };
    try {
      if (edit) await api(`/api/assignments/${edit.id}`, { method: "PUT", body: base });
      else await api(`/api/projects/${projectId}/assignments`, { body: mode === "existing" ? { ...base, responsibleId: v.responsibleId } : { ...base, responsible: personBody(p) } });
      toast.ok(edit ? "Vínculo atualizado." : "Responsável vinculado."); onSaved();
    } catch (x) { if (x instanceof ApiError) { setErrs(x.fields); setTop(x.message); } else setTop("Não foi possível salvar."); setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={edit ? `Editar vínculo — ${edit.responsible.name}` : "Vincular responsável"} onSubmit={submit} wide
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button></>}>
      {top && <div className="alert alert-bad" role="alert" style={{ marginBottom: 12 }}>{top}</div>}
      {!edit && (
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
          <legend className="sr-only">Origem do responsável</legend>
          <div className="actions">
            <label className="checkline"><input type="radio" name="mode" checked={mode === "existing"} onChange={() => setMode("existing")} /> Responsável já cadastrado</label>
            <label className="checkline"><input type="radio" name="mode" checked={mode === "new"} onChange={() => setMode("new")} /> Cadastrar novo</label>
          </div>
        </fieldset>
      )}
      {!edit && mode === "existing" && (
        resps.loading ? <p className="muted">Carregando responsáveis…</p> : (
          <SelectField label="Responsável" name="responsibleId" required value={v.responsibleId ?? ""} onChange={set("responsibleId")} error={errs.responsibleId} placeholder="Selecione"
            options={(resps.data ?? []).map((r) => [r.id, `${r.name}${r.companyName ? ` — ${r.companyName}` : ""}`])} hint={resps.data?.length === 0 ? "Nenhum responsável cadastrado: use “Cadastrar novo”." : undefined} />
        )
      )}
      {!edit && mode === "new" && <PersonFields v={p} set={setPerson} errs={errs} prefix="responsible." />}
      <h3 style={{ margin: "18px 0 10px" }}>Função e período</h3>
      <div className="grid">
        <div className="c6"><SelectField label="Função" name="role" required value={v.role ?? ""} onChange={set("role")} error={errs.role} placeholder="Selecione" options={opts(responsibleRoleLabels)} /></div>
        {v.role === "OTHER" && <div className="c6"><TextField label="Descrição da função" name="roleDetail" required value={v.roleDetail ?? ""} onChange={set("roleDetail")} error={errs.roleDetail} maxLength={100} /></div>}
        <div className="c6"><TextField label="Início" name="startDate" type="date" required value={v.startDate ?? ""} onChange={set("startDate")} error={errs.startDate} /></div>
        <div className="c6"><TextField label="Término" name="endDate" type="date" value={v.endDate ?? ""} onChange={set("endDate")} error={errs.endDate} hint="Deixe em branco se o vínculo está em vigor." /></div>
        <div style={{ gridColumn: "span 12" }}><TextArea label="Observações do vínculo" name="notes" value={v.notes ?? ""} onChange={set("notes")} error={errs.notes} maxLength={2000} /></div>
      </div>
    </Modal>
  );
}

export function EndAssignmentModal({ a, onClose, onDone }: { a: Assign | undefined; onClose: () => void; onDone: () => void }) {
  const open = !!a; const toast = useToast();
  const [date, setDate] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setDate(new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })); setErr(""); setBusy(false); } }, [open]);
  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!date) return setErr(R);
    setBusy(true);
    try { await api(`/api/assignments/${a!.id}/end`, { body: { endDate: date } }); toast.ok("Vínculo encerrado."); onDone(); }
    catch (x) { setErr(x instanceof ApiError ? (x.fields.endDate ?? x.message) : "Não foi possível encerrar."); setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Desvincular responsável" onSubmit={submit}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-danger-solid" disabled={busy}>{busy ? "Encerrando…" : "Encerrar vínculo"}</button></>}>
      <p style={{ marginBottom: 12 }}><b>{a?.responsible.name}</b> deixará de constar como responsável vigente. O histórico do vínculo é mantido.</p>
      <TextField label="Data de término" name="endDate" type="date" required value={date} onChange={(x) => { setDate(x); setErr(""); }} error={err} hint="O vínculo continua vigente até a data de término, inclusive." />
    </Modal>
  );
}

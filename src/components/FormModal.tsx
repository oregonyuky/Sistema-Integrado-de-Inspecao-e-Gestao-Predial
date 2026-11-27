"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/ui/api";
import { Modal, SelectField, TextArea, TextField, useToast } from "@/ui/kit";

export type Field = {
  name: string; label: string; kind?: "text" | "area" | "select" | "date" | "check" | "multi"; required?: boolean; maxLength?: number; hint?: string;
  options?: [string, string][]; span?: 4 | 6 | 8 | 12;
};
export type FormState = undefined | { id?: string; values: Record<string, string | boolean | string[]> };

/** Modal de formulário simples e reutilizável: valida obrigatórios, envia e mostra erros por campo. */
export function FormModal({ title, fields, state, onClose, onSaved, submit, okMsg, wide }: {
  title: string; fields: Field[]; state: FormState; onClose: () => void; onSaved: () => void; okMsg: string; wide?: boolean;
  submit: (values: Record<string, string | boolean | string[]>, id?: string) => Promise<unknown>;
}) {
  const toast = useToast();
  const [v, setV] = useState<Record<string, string | boolean | string[]>>({});
  const [errs, setErrs] = useState<Record<string, string>>({}); const [top, setTop] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (state) { setV(state.values); setErrs({}); setTop(""); setBusy(false); } /* eslint-disable-next-line */ }, [state]);
  const set = (k: string, x: string | boolean | string[]) => { setV((o) => ({ ...o, [k]: x })); setErrs((o) => ({ ...o, [k]: "" })); };
  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const er: Record<string, string> = {};
    for (const f of fields) if (f.required && !String(v[f.name] ?? "").trim()) er[f.name] = "Campo obrigatório.";
    setErrs(er); if (Object.keys(er).length) return setTop("Revise os campos destacados.");
    setBusy(true); setTop("");
    try { await submit(v, state?.id); toast.ok(okMsg); onSaved(); }
    catch (x) { if (x instanceof ApiError) { setErrs(x.fields); setTop(x.message); } else setTop("Não foi possível salvar."); setBusy(false); }
  }
  return (
    <Modal open={!!state} onClose={onClose} title={title} onSubmit={onSubmit} wide={wide}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button></>}>
      {top && <div className="alert alert-bad" role="alert" style={{ marginBottom: 12 }}>{top}</div>}
      <div className="grid">
        {fields.map((f, i) => {
          const val = v[f.name]; const span = f.span ?? 12; const cls = span === 12 ? undefined : `c${span}`;
          const wrap = (n: React.ReactNode) => <div key={f.name} className={cls} style={span === 12 ? { gridColumn: "span 12" } : undefined}>{n}</div>;
          if (f.kind === "area") return wrap(<TextArea label={f.label} name={f.name} required={f.required} value={String(val ?? "")} onChange={(x) => set(f.name, x)} error={errs[f.name]} maxLength={f.maxLength} hint={f.hint} />);
          if (f.kind === "select") return wrap(<SelectField label={f.label} name={f.name} required={f.required} value={String(val ?? "")} onChange={(x) => set(f.name, x)} error={errs[f.name]} options={f.options ?? []} placeholder="Selecione" hint={f.hint} />);
          if (f.kind === "check") return wrap(<label className="checkline"><input type="checkbox" checked={!!val} onChange={(e) => set(f.name, e.target.checked)} /> {f.label}</label>);
          if (f.kind === "multi") {
            const arr = (val as string[]) ?? [];
            return wrap(<fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="lbl">{f.label}</legend>
              {(f.options ?? []).length === 0 ? <p className="hint">Nenhuma opção disponível.</p> : (f.options ?? []).map(([id, name]) => (
                <label key={id} className="checkline"><input type="checkbox" checked={arr.includes(id)} onChange={(e) => set(f.name, e.target.checked ? [...arr, id] : arr.filter((x) => x !== id))} /> {name}</label>))}
              {errs[f.name] && <p className="err" role="alert">{errs[f.name]}</p>}</fieldset>);
          }
          return wrap(<TextField label={f.label} name={f.name} type={f.kind === "date" ? "date" : "text"} required={f.required} value={String(val ?? "")} onChange={(x) => set(f.name, x)} error={errs[f.name]} maxLength={f.maxLength} hint={f.hint} autoFocus={i === 0} />);
        })}
      </div>
    </Modal>
  );
}
export { api };

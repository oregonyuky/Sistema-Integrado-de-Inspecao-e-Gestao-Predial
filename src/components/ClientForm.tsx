"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/ui/api";
import { SelectField, TextArea, TextField, opts, useCan, useToast } from "@/ui/kit";
import { personTypeLabels } from "@/lib/labels";
import { BR_STATES, formatDocument } from "@/lib/document";
import { formatPhone, formatZip } from "@/lib/format";

export type ClientData = Partial<Record<"personType" | "name" | "tradeName" | "document" | "email" | "phone" | "addressLine" | "addressNumber" | "complement" | "district" | "city" | "state" | "zipCode" | "contactName" | "notes", string | null>> & { id?: string; masked?: boolean };
const KEYS = ["name", "tradeName", "document", "email", "phone", "addressLine", "addressNumber", "complement", "district", "city", "state", "zipCode", "contactName", "notes"] as const;

export function ClientForm({ initial }: { initial?: ClientData }) {
  const router = useRouter();
  const toast = useToast();
  const can = useCan();
  const readOnly = !can.write || !!initial?.masked;
  const [v, setV] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = { personType: initial?.personType ?? "LEGAL_ENTITY" };
    for (const k of KEYS) o[k] = initial?.[k] ?? "";
    if (o.document && !initial?.masked) o.document = formatDocument(o.document);
    if (o.phone && !initial?.masked) o.phone = formatPhone(o.phone);
    if (o.zipCode && !initial?.masked) o.zipCode = formatZip(o.zipCode);
    return o;
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [top, setTop] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (val: string) => { setV((s) => ({ ...s, [k]: val })); setErrs((e) => ({ ...e, [k]: "" })); };
  const pj = v.personType === "LEGAL_ENTITY";

  function validate() {
    const e: Record<string, string> = {};
    if (!v.name.trim()) e.name = "Campo obrigatório.";
    if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) e.email = "E-mail inválido.";
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrs(e); setTop("");
    if (Object.keys(e).length) { setTop("Revise os campos destacados."); return; }
    setBusy(true);
    try {
      const body = { ...v };
      const saved = initial?.id
        ? await api<{ id: string }>(`/api/clients/${initial.id}`, { method: "PUT", body })
        : await api<{ id: string }>("/api/clients", { body });
      toast.ok(initial?.id ? "Cliente atualizado." : "Cliente cadastrado.");
      router.push(initial?.id ? "/clientes" : `/clientes/${saved.id}`);
      router.refresh();
    } catch (x) {
      if (x instanceof ApiError) { setErrs(x.fields); setTop(x.message); } else setTop("Não foi possível salvar.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {initial?.masked && <div className="alert alert-info" style={{ marginBottom: 16 }}>Seu perfil é de consulta: dados pessoais de pessoa física aparecem parcialmente ocultos e não podem ser editados.</div>}
      {top && <div className="alert alert-bad" role="alert" style={{ marginBottom: 16 }}>{top}</div>}
      <fieldset disabled={readOnly || busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <section className="formsec" style={{ borderTop: 0 }} aria-labelledby="s1">
          <h2 id="s1">Identificação</h2>
          <div className="grid">
            <div className="c4"><SelectField label="Tipo de pessoa" name="personType" required value={v.personType} onChange={set("personType")} options={opts(personTypeLabels)} error={errs.personType} /></div>
            <div className="c8"><TextField label={pj ? "Razão social" : "Nome completo"} name="name" required value={v.name} onChange={set("name")} error={errs.name} maxLength={200} /></div>
            {pj && <div className="c8"><TextField label="Nome fantasia" name="tradeName" value={v.tradeName} onChange={set("tradeName")} error={errs.tradeName} maxLength={200} /></div>}
            <div className="c4"><TextField label={pj ? "CNPJ" : "CPF"} name="document" value={v.document} onChange={set("document")} error={errs.document} hint={pj ? "Aceita CNPJ numérico e alfanumérico." : "Somente números."} inputMode="text" /></div>
          </div>
        </section>
        <section className="formsec" aria-labelledby="s2">
          <h2 id="s2">Contato</h2>
          <div className="grid">
            {pj && <div className="c6"><TextField label="Pessoa de contato" name="contactName" value={v.contactName} onChange={set("contactName")} error={errs.contactName} /></div>}
            <div className="c6"><TextField label="E-mail" name="email" type="email" value={v.email} onChange={set("email")} error={errs.email} /></div>
            <div className="c4"><TextField label="Telefone" name="phone" type="tel" value={v.phone} onChange={set("phone")} error={errs.phone} hint="Com DDD." inputMode="tel" /></div>
          </div>
        </section>
        <section className="formsec" aria-labelledby="s3">
          <h2 id="s3">Endereço</h2>
          <div className="grid">
            <div className="c3"><TextField label="CEP" name="zipCode" value={v.zipCode} onChange={set("zipCode")} error={errs.zipCode} inputMode="numeric" /></div>
            <div className="c6"><TextField label="Logradouro" name="addressLine" value={v.addressLine} onChange={set("addressLine")} error={errs.addressLine} /></div>
            <div className="c3"><TextField label="Número" name="addressNumber" value={v.addressNumber} onChange={set("addressNumber")} error={errs.addressNumber} /></div>
            <div className="c4"><TextField label="Complemento" name="complement" value={v.complement} onChange={set("complement")} error={errs.complement} /></div>
            <div className="c4"><TextField label="Bairro" name="district" value={v.district} onChange={set("district")} error={errs.district} /></div>
            <div className="c3"><TextField label="Cidade" name="city" value={v.city} onChange={set("city")} error={errs.city} /></div>
            <div className="c3" style={{ maxWidth: 140 }}><SelectField label="UF" name="state" value={v.state} onChange={set("state")} error={errs.state} placeholder="—" options={BR_STATES.map((s) => [s, s])} /></div>
          </div>
        </section>
        <section className="formsec" aria-labelledby="s4">
          <h2 id="s4">Observações</h2>
          <TextArea label="Observações" name="notes" value={v.notes} onChange={set("notes")} error={errs.notes} maxLength={4000} />
        </section>
      </fieldset>
      <div className="formbar">
        <Link className="btn" href="/clientes">{readOnly ? "Voltar" : "Cancelar"}</Link>
        {!readOnly && <button className="btn btn-primary" disabled={busy}>{busy ? <><span className="spin" /> Salvando…</> : initial?.id ? "Salvar alterações" : "Cadastrar cliente"}</button>}
      </div>
    </form>
  );
}

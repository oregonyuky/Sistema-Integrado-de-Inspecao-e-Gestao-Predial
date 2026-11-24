"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, ApiError } from "@/ui/api";
import { SelectField, TextArea, TextField, opts, useDebounced, useFetch, useToast } from "@/ui/kit";
import { projectTypeLabels, useTypeLabels } from "@/lib/labels";
import { BR_STATES } from "@/lib/document";
import { formatZip } from "@/lib/format";

type Ch = Record<string, string | number | null> | null;
export type ProjectData = { id?: string; clientId?: string; client?: { id: string; name: string }; code?: string; name?: string; projectType?: string; addressLine?: string | null; addressNumber?: string | null; complement?: string | null; district?: string | null; city?: string; state?: string; zipCode?: string | null; latitude?: number | null; longitude?: number | null; description?: string | null; characteristics?: Ch };
const P = ["code", "name", "projectType", "addressLine", "addressNumber", "complement", "district", "city", "state", "zipCode", "description"] as const;
const C = ["landAreaM2", "builtAreaM2", "constructionYear", "estimatedAgeYears", "useType", "occupancyType", "constructionTypology", "predominantSystem", "structureInfo", "expansionsInfo", "renovationsInfo", "technicalNotes"] as const;
const SECTIONS = [["basico", "Dados básicos"], ["endereco", "Endereço"], ["caracterizacao", "Caracterização técnica"]] as const;

export function ProjectForm({ initial, readOnly }: { initial?: ProjectData; readOnly?: boolean }) {
  const router = useRouter(); const toast = useToast();
  const s = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  const [v, setV] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = { clientId: s(initial?.clientId), latitude: s(initial?.latitude), longitude: s(initial?.longitude) };
    for (const k of P) o[k] = s(initial?.[k]);
    for (const k of C) o[k] = s(initial?.characteristics?.[k]);
    if (o.zipCode) o.zipCode = formatZip(o.zipCode);
    if (!initial?.id && !o.projectType) o.projectType = "";
    return o;
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [top, setTop] = useState(""); const [busy, setBusy] = useState(false);
  const [cq, setCq] = useState(""); const dcq = useDebounced(cq);
  const clients = useFetch<{ items: { id: string; name: string }[] }>(`/api/clients?status=ACTIVE&pageSize=50${dcq ? `&q=${encodeURIComponent(dcq)}` : ""}`);
  const clientOpts = useMemo(() => {
    const list = clients.data?.items.map((c) => [c.id, c.name] as [string, string]) ?? [];
    if (initial?.client && !list.some(([id]) => id === initial.client!.id)) list.unshift([initial.client.id, initial.client.name]);
    return list;
  }, [clients.data, initial?.client]);

  const set = (k: string) => (val: string) => { setV((x) => ({ ...x, [k]: val })); setErrs((e) => ({ ...e, [k]: "" })); };
  const err = (k: string) => errs[k] || errs[`characteristics.${k}`];

  function validate() {
    const e: Record<string, string> = {}; const R = "Campo obrigatório.";
    for (const k of ["clientId", "code", "name", "projectType", "addressLine", "city", "state"]) if (!v[k]?.trim()) e[k] = R;
    if (v.code && !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(v.code.trim())) e.code = "Use letras, números, ponto, hífen ou barra, sem espaços.";
    if (!!v.latitude.trim() !== !!v.longitude.trim()) e[v.latitude.trim() ? "longitude" : "latitude"] = "Informe latitude e longitude juntas.";
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate(); setErrs(e); setTop("");
    if (Object.keys(e).length) { setTop("Revise os campos destacados."); document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(); return; }
    setBusy(true);
    const { landAreaM2, builtAreaM2, constructionYear, estimatedAgeYears, useType, occupancyType, constructionTypology, predominantSystem, structureInfo, expansionsInfo, renovationsInfo, technicalNotes, ...proj } = v;
    const body = { ...proj, characteristics: { landAreaM2, builtAreaM2, constructionYear, estimatedAgeYears, useType: useType || null, occupancyType, constructionTypology, predominantSystem, structureInfo, expansionsInfo, renovationsInfo, technicalNotes } };
    try {
      const saved = initial?.id ? await api<{ id: string }>(`/api/projects/${initial.id}`, { method: "PUT", body }) : await api<{ id: string }>("/api/projects", { body });
      toast.ok(initial?.id ? "Empreendimento atualizado." : "Empreendimento cadastrado.");
      router.push(`/empreendimentos/${saved.id}`);
    } catch (x) {
      if (x instanceof ApiError) { setErrs(x.fields); setTop(x.message); } else setTop("Não foi possível salvar.");
      window.scrollTo({ top: 0, behavior: "smooth" }); setBusy(false);
    }
  }
  const secErr = (keys: string[]) => keys.some((k) => err(k));

  return (
    <form onSubmit={submit} noValidate>
      <nav className="tabs" aria-label="Seções do formulário">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className={secErr(id === "basico" ? ["clientId", "code", "name", "projectType", "description"] : id === "endereco" ? ["addressLine", "addressNumber", "complement", "district", "city", "state", "zipCode", "latitude", "longitude"] : [...C]) ? "has-err" : ""}>{label}</a>
        ))}
      </nav>
      {top && <div className="alert alert-bad" role="alert" style={{ marginBottom: 16 }}>{top}</div>}
      <fieldset disabled={readOnly || busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <section id="basico" className="formsec" style={{ borderTop: 0, scrollMarginTop: 16 }} aria-labelledby="h-b">
          <h2 id="h-b">Dados básicos</h2>
          <div className="grid">
            <div className="c4"><TextField label="Buscar cliente" name="cq" value={cq} onChange={setCq} placeholder="Digite para filtrar" hint="Lista os 50 primeiros clientes ativos." /></div>
            <div className="c8"><SelectField label="Cliente" name="clientId" required value={v.clientId} onChange={set("clientId")} error={err("clientId")} placeholder="Selecione o cliente" options={clientOpts} /></div>
            <div className="c3"><TextField label="Código" name="code" required value={v.code} onChange={set("code")} error={err("code")} maxLength={40} hint="Único na organização." /></div>
            <div className="c9"><TextField label="Nome do empreendimento" name="name" required value={v.name} onChange={set("name")} error={err("name")} maxLength={200} /></div>
            <div className="c6"><SelectField label="Tipo de empreendimento" name="projectType" required value={v.projectType} onChange={set("projectType")} error={err("projectType")} placeholder="Selecione" options={opts(projectTypeLabels)} /></div>
            <div className="c12" style={{ gridColumn: "span 12" }}><TextArea label="Descrição" name="description" value={v.description} onChange={set("description")} error={err("description")} maxLength={4000} /></div>
          </div>
        </section>
        <section id="endereco" className="formsec" style={{ scrollMarginTop: 16 }} aria-labelledby="h-e">
          <h2 id="h-e">Endereço e localização</h2>
          <div className="grid">
            <div className="c3"><TextField label="CEP" name="zipCode" value={v.zipCode} onChange={set("zipCode")} error={err("zipCode")} inputMode="numeric" /></div>
            <div className="c6"><TextField label="Logradouro" name="addressLine" required value={v.addressLine} onChange={set("addressLine")} error={err("addressLine")} /></div>
            <div className="c3"><TextField label="Número" name="addressNumber" value={v.addressNumber} onChange={set("addressNumber")} error={err("addressNumber")} /></div>
            <div className="c4"><TextField label="Complemento" name="complement" value={v.complement} onChange={set("complement")} error={err("complement")} /></div>
            <div className="c4"><TextField label="Bairro" name="district" value={v.district} onChange={set("district")} error={err("district")} /></div>
            <div className="c4" />
            <div className="c5"><TextField label="Cidade" name="city" required value={v.city} onChange={set("city")} error={err("city")} /></div>
            <div className="c3"><SelectField label="UF" name="state" required value={v.state} onChange={set("state")} error={err("state")} placeholder="Selecione" options={BR_STATES.map((x) => [x, x])} /></div>
            <div className="c4" />
            <div className="c4"><TextField label="Latitude" name="latitude" value={v.latitude} onChange={set("latitude")} error={err("latitude")} inputMode="decimal" hint="Opcional. Ex.: -23,5505" /></div>
            <div className="c4"><TextField label="Longitude" name="longitude" value={v.longitude} onChange={set("longitude")} error={err("longitude")} inputMode="decimal" /></div>
          </div>
        </section>
        <section id="caracterizacao" className="formsec" style={{ scrollMarginTop: 16 }} aria-labelledby="h-c">
          <h2 id="h-c">Caracterização técnica</h2>
          <p className="hint" style={{ marginBottom: 14 }}>Todos os campos são opcionais. Se o ano de construção for informado, a idade é calculada a partir dele; caso contrário, vale a idade estimada.</p>
          <div className="grid">
            <div className="c3"><TextField label="Área do terreno (m²)" name="landAreaM2" value={v.landAreaM2} onChange={set("landAreaM2")} error={err("landAreaM2")} inputMode="decimal" /></div>
            <div className="c3"><TextField label="Área construída (m²)" name="builtAreaM2" value={v.builtAreaM2} onChange={set("builtAreaM2")} error={err("builtAreaM2")} inputMode="decimal" /></div>
            <div className="c3"><TextField label="Ano de construção" name="constructionYear" value={v.constructionYear} onChange={set("constructionYear")} error={err("constructionYear")} inputMode="numeric" /></div>
            <div className="c3"><TextField label="Idade estimada (anos)" name="estimatedAgeYears" value={v.estimatedAgeYears} onChange={set("estimatedAgeYears")} error={err("estimatedAgeYears")} inputMode="numeric" /></div>
            <div className="c4"><SelectField label="Tipo de uso" name="useType" value={v.useType} onChange={set("useType")} error={err("useType")} placeholder="Não informado" options={opts(useTypeLabels)} /></div>
            <div className="c4"><TextField label="Tipo de ocupação" name="occupancyType" value={v.occupancyType} onChange={set("occupancyType")} error={err("occupancyType")} /></div>
            <div className="c4"><TextField label="Tipologia construtiva" name="constructionTypology" value={v.constructionTypology} onChange={set("constructionTypology")} error={err("constructionTypology")} /></div>
            <div className="c6"><TextField label="Sistema construtivo predominante" name="predominantSystem" value={v.predominantSystem} onChange={set("predominantSystem")} error={err("predominantSystem")} /></div>
            <div className="c6"><TextArea label="Estrutura" name="structureInfo" value={v.structureInfo} onChange={set("structureInfo")} error={err("structureInfo")} maxLength={4000} /></div>
            <div className="c6"><TextArea label="Ampliações" name="expansionsInfo" value={v.expansionsInfo} onChange={set("expansionsInfo")} error={err("expansionsInfo")} maxLength={4000} /></div>
            <div className="c6"><TextArea label="Reformas" name="renovationsInfo" value={v.renovationsInfo} onChange={set("renovationsInfo")} error={err("renovationsInfo")} maxLength={4000} /></div>
            <div style={{ gridColumn: "span 12" }}><TextArea label="Observações técnicas" name="technicalNotes" value={v.technicalNotes} onChange={set("technicalNotes")} error={err("technicalNotes")} maxLength={4000} /></div>
          </div>
        </section>
      </fieldset>
      <div className="formbar">
        <Link className="btn" href={initial?.id ? `/empreendimentos/${initial.id}` : "/empreendimentos"}>Cancelar</Link>
        {!readOnly && <button className="btn btn-primary" disabled={busy}>{busy ? <><span className="spin" /> Salvando…</> : initial?.id ? "Salvar alterações" : "Cadastrar empreendimento"}</button>}
      </div>
    </form>
  );
}

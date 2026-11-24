"use client";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/ui/api";
import { Modal, SelectField, TextArea, TextField, opts, useToast } from "@/ui/kit";
import { areaClassLabels, buildingTypeLabels, floorKindLabels, locationTypeLabels, unitTypeLabels } from "@/lib/labels";
import type { B, L, Target, Tree } from "./structure-types";

const s = (x: unknown) => (x === null || x === undefined ? "" : String(x));

function useForm(initial: Record<string, string>, open: boolean) {
  const [v, setV] = useState(initial);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [top, setTop] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setV(initial); setErrs({}); setTop(""); setBusy(false); } /* eslint-disable-next-line */ }, [open]);
  const set = (k: string) => (val: string) => { setV((x) => ({ ...x, [k]: val })); setErrs((e) => ({ ...e, [k]: "" })); };
  return { v, set, errs, setErrs, top, setTop, busy, setBusy };
}

/* ───────── edificação ───────── */
export function BuildingModal({ projectId, building, onClose, onSaved }: { projectId: string; building: B | null | undefined; onClose: () => void; onSaved: (id: string) => void }) {
  const open = building !== undefined;
  const toast = useToast();
  const f = useForm({ code: s(building?.code), name: s(building?.name), buildingType: s(building?.buildingType) || "BLOCK", description: s(building?.description), builtAreaM2: s(building?.builtAreaM2), constructionYear: s(building?.constructionYear), notes: s(building?.notes) }, open);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.v.code.trim()) er.code = "Campo obrigatório."; if (!f.v.name.trim()) er.name = "Campo obrigatório."; if (!f.v.buildingType) er.buildingType = "Selecione o tipo.";
    f.setErrs(er); if (Object.keys(er).length) return f.setTop("Revise os campos destacados.");
    f.setBusy(true); f.setTop("");
    try {
      const r = building ? await api<B>(`/api/buildings/${building.id}`, { method: "PUT", body: f.v }) : await api<B>(`/api/projects/${projectId}/buildings`, { body: f.v });
      toast.ok(building ? "Edificação atualizada." : "Edificação criada."); onSaved(r.id);
    } catch (x) { if (x instanceof ApiError) { f.setErrs(x.fields); f.setTop(x.message); } f.setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={building ? "Editar edificação" : "Nova edificação"} onSubmit={submit}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={f.busy}>{f.busy ? "Salvando…" : "Salvar"}</button></>}>
      {f.top && <div className="alert alert-bad" role="alert" style={{ marginBottom: 12 }}>{f.top}</div>}
      <div className="grid">
        <div className="c4"><TextField label="Código" name="code" required value={f.v.code} onChange={f.set("code")} error={f.errs.code} hint="Ex.: B01" maxLength={40} autoFocus /></div>
        <div className="c8"><TextField label="Nome" name="name" required value={f.v.name} onChange={f.set("name")} error={f.errs.name} maxLength={200} /></div>
        <div className="c6"><SelectField label="Tipo" name="buildingType" required value={f.v.buildingType} onChange={f.set("buildingType")} error={f.errs.buildingType} options={opts(buildingTypeLabels)} /></div>
        <div className="c3"><TextField label="Área construída (m²)" name="builtAreaM2" value={f.v.builtAreaM2} onChange={f.set("builtAreaM2")} error={f.errs.builtAreaM2} inputMode="decimal" /></div>
        <div className="c3"><TextField label="Ano" name="constructionYear" value={f.v.constructionYear} onChange={f.set("constructionYear")} error={f.errs.constructionYear} inputMode="numeric" /></div>
        <div style={{ gridColumn: "span 12" }}><TextArea label="Descrição" name="description" value={f.v.description} onChange={f.set("description")} error={f.errs.description} maxLength={4000} /></div>
        <div style={{ gridColumn: "span 12" }}><TextArea label="Observações" name="notes" value={f.v.notes} onChange={f.set("notes")} error={f.errs.notes} maxLength={4000} /></div>
      </div>
    </Modal>
  );
}

/* ───────── localização (pavimento, ambiente, área, unidade) ───────── */
export function LocationModal({ projectId, state, onClose, onSaved }: {
  projectId: string; state: undefined | { edit: L } | { target: Target; type?: string }; onClose: () => void; onSaved: (id: string) => void;
}) {
  const open = state !== undefined;
  const toast = useToast();
  const edit = state && "edit" in state ? state.edit : null;
  const target = state && "target" in state ? state.target : null;
  const fixedType = target?.mode === "floor" ? "FLOOR" : undefined;
  const f = useForm({
    code: s(edit?.code), name: s(edit?.name), locationType: edit?.locationType ?? fixedType ?? (state && "type" in state ? s(state.type) : ""),
    areaClass: edit?.areaClass ?? "UNDEFINED", floorKind: s(edit?.floorKind), floorOrder: s(edit?.floorOrder), elevationM: s(edit?.elevationM),
    areaM2: s(edit?.areaM2), description: s(edit?.description), unitType: s(edit?.unit?.unitType) || "RESIDENTIAL", privateAreaM2: s(edit?.unit?.privateAreaM2),
  }, open);
  const t = f.v.locationType;
  const typeOpts = useMemo(() => opts(locationTypeLabels).filter(([k]) => (target?.mode === "floor" ? k === "FLOOR" : k !== "FLOOR")), [target?.mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.v.code.trim()) er.code = "Campo obrigatório."; if (!f.v.name.trim()) er.name = "Campo obrigatório."; if (!t) er.locationType = "Selecione o tipo.";
    f.setErrs(er); if (Object.keys(er).length) return f.setTop("Revise os campos destacados.");
    f.setBusy(true); f.setTop("");
    const body: Record<string, unknown> = { code: f.v.code, name: f.v.name, locationType: t, areaM2: f.v.areaM2, description: f.v.description };
    if (t !== "UNIT") body.areaClass = f.v.areaClass;
    if (t === "FLOOR") { body.floorKind = f.v.floorKind || null; body.floorOrder = f.v.floorOrder; body.elevationM = f.v.elevationM; }
    if (t === "UNIT") body.unit = { unitType: f.v.unitType, privateAreaM2: f.v.privateAreaM2 };
    try {
      const r = edit
        ? await api<L>(`/api/locations/${edit.id}`, { method: "PUT", body })
        : await api<L>(`/api/projects/${projectId}/locations`, { body: { ...body, buildingId: target!.buildingId, parentLocationId: target!.parentLocationId } });
      toast.ok(edit ? "Item atualizado." : "Item criado."); onSaved(r.id);
    } catch (x) { if (x instanceof ApiError) { f.setErrs(x.fields); f.setTop(x.message); } else f.setTop("Não foi possível salvar."); f.setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={edit ? "Editar item" : `Novo item${target ? ` — ${target.label}` : ""}`} onSubmit={submit}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={f.busy}>{f.busy ? "Salvando…" : "Salvar"}</button></>}>
      {f.top && <div className="alert alert-bad" role="alert" style={{ marginBottom: 12 }}>{f.top}</div>}
      <div className="grid">
        <div className="c6"><SelectField label="Tipo" name="locationType" required value={t} onChange={f.set("locationType")} error={f.errs.locationType} placeholder="Selecione" options={edit ? opts(locationTypeLabels) : typeOpts}
          disabled={!!edit && (edit.locationType === "FLOOR" || edit.locationType === "UNIT")} hint={edit && (edit.locationType === "FLOOR" || edit.locationType === "UNIT") ? "O tipo não pode ser alterado." : undefined} /></div>
        <div className="c6"><TextField label="Código" name="code" required value={f.v.code} onChange={f.set("code")} error={f.errs.code} maxLength={40} hint="Único dentro da edificação." autoFocus /></div>
        <div style={{ gridColumn: "span 12" }}><TextField label="Nome" name="name" required value={f.v.name} onChange={f.set("name")} error={f.errs.name} maxLength={200} /></div>
        {t !== "UNIT" && t && <div className="c6"><SelectField label="Classificação da área" name="areaClass" value={f.v.areaClass} onChange={f.set("areaClass")} error={f.errs.areaClass} options={opts(areaClassLabels)} hint="Áreas comuns são tratadas separadamente das privativas." /></div>}
        {t === "FLOOR" && (<>
          <div className="c6"><SelectField label="Tipo de pavimento" name="floorKind" value={f.v.floorKind} onChange={f.set("floorKind")} error={f.errs.floorKind} placeholder="Não informado" options={opts(floorKindLabels)} /></div>
          <div className="c6"><TextField label="Ordem (nível)" name="floorOrder" value={f.v.floorOrder} onChange={f.set("floorOrder")} error={f.errs.floorOrder} inputMode="numeric" hint="Subsolos negativos; térreo 0." /></div>
          <div className="c6"><TextField label="Cota (m)" name="elevationM" value={f.v.elevationM} onChange={f.set("elevationM")} error={f.errs.elevationM} inputMode="decimal" /></div>
        </>)}
        {t === "UNIT" && (<>
          <div className="c6"><SelectField label="Tipo de unidade" name="unitType" required value={f.v.unitType} onChange={f.set("unitType")} error={f.errs["unit.unitType"]} options={opts(unitTypeLabels)} /></div>
          <div className="c6"><TextField label="Área privativa (m²)" name="privateAreaM2" value={f.v.privateAreaM2} onChange={f.set("privateAreaM2")} error={f.errs["unit.privateAreaM2"]} inputMode="decimal" /></div>
          <p className="hint" style={{ gridColumn: "span 12" }}>Dados de moradores ou ocupantes não são armazenados neste módulo.</p>
        </>)}
        <div className="c6"><TextField label="Área (m²)" name="areaM2" value={f.v.areaM2} onChange={f.set("areaM2")} error={f.errs.areaM2} inputMode="decimal" /></div>
        <div style={{ gridColumn: "span 12" }}><TextArea label="Descrição" name="description" value={f.v.description} onChange={f.set("description")} error={f.errs.description} maxLength={4000} /></div>
      </div>
    </Modal>
  );
}

/* ───────── mover ───────── */
export function MoveModal({ tree, item, onClose, onMoved }: { tree: Tree; item: L | undefined; onClose: () => void; onMoved: (id: string) => void }) {
  const open = !!item;
  const toast = useToast();
  const [dest, setDest] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setDest(""); setErr(""); setBusy(false); } }, [open]);

  const options = useMemo(() => {
    if (!item) return [] as [string, string][];
    const kids = new Map<string, L[]>();
    for (const l of tree.locations) if (l.parentLocationId) kids.set(l.parentLocationId, [...(kids.get(l.parentLocationId) ?? []), l]);
    const sub = new Set<string>(); const walk = (id: string) => { sub.add(id); (kids.get(id) ?? []).forEach((k) => walk(k.id)); }; walk(item.id);
    const byId = new Map(tree.locations.map((l) => [l.id, l]));
    const label = (l: L): string => { const p = l.parentLocationId ? byId.get(l.parentLocationId) : undefined; return `${p ? `${label(p)} › ` : ""}${l.name}`; };
    const bs = tree.buildings.filter((b) => b.status === "ACTIVE");
    const out: [string, string][] = [];
    if (item.locationType !== "FLOOR") out.push(["root", "Raiz do empreendimento (sem edificação)"]);
    for (const b of bs) out.push([`b:${b.id}`, `${b.name} (raiz da edificação)`]);
    if (item.locationType !== "FLOOR")
      for (const l of tree.locations.filter((x) => x.status === "ACTIVE" && !sub.has(x.id))) {
        const b = tree.buildings.find((x) => x.id === l.buildingId);
        out.push([`l:${l.id}`, `${b ? `${b.name} › ` : ""}${label(l)}`]);
      }
    return out;
  }, [tree, item]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dest) return setErr("Selecione o destino.");
    setBusy(true); setErr("");
    const body = dest === "root" ? { parentLocationId: null, buildingId: null } : dest.startsWith("b:") ? { parentLocationId: null, buildingId: dest.slice(2) } : { parentLocationId: dest.slice(2) };
    try { await api(`/api/locations/${item!.id}/move`, { body }); toast.ok("Item movido."); onMoved(item!.id); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Não foi possível mover."); setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={`Mover “${item?.name ?? ""}”`} onSubmit={submit}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy}>{busy ? "Movendo…" : "Mover"}</button></>}>
      {err && <div className="alert alert-bad" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <p style={{ marginBottom: 12 }} className="muted">Os itens internos acompanham o item movido. Códigos não podem se repetir no destino.</p>
      <SelectField label="Novo local" name="dest" required value={dest} onChange={(v) => { setDest(v); setErr(""); }} placeholder="Selecione o destino" options={options} />
    </Modal>
  );
}

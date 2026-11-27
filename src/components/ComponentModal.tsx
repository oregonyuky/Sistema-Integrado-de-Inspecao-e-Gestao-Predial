"use client";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/ui/api";
import { Modal, SelectField, TextArea, TextField, useFetch, useToast } from "@/ui/kit";
import type { CatItem } from "./catalog-types";

type Sys = { systemId: string; selected: boolean };
type Tree = { buildings: { id: string; name: string }[]; locations: { id: string; name: string; buildingId: string | null; parentLocationId: string | null; status: string }[] };
export type CompData = { id: string; name: string; tag: string | null; manufacturer: string | null; model: string | null; serialNumber: string | null; installedOn: string | null; description: string | null; notes: string | null; type: { id: string; name: string } | null; location: { id: string } | null };
const s = (x: unknown) => (x === null || x === undefined ? "" : String(x));

/** Cria ou edita um componente. O tipo só pode ser escolhido na criação (é imutável) e apenas entre sistemas selecionados. */
export function ComponentModal({ projectId, open, component, onClose, onSaved }: { projectId: string; open: boolean; component: CompData | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast(); const edit = component;
  const cat = useFetch<{ items: CatItem[] }>(open ? "/api/catalog?status=ACTIVE" : null);
  const sys = useFetch<Sys[]>(open ? `/api/projects/${projectId}/systems` : null);
  const tree = useFetch<Tree>(open ? `/api/projects/${projectId}/tree` : null);
  const [v, setV] = useState<Record<string, string>>({}); const [errs, setErrs] = useState<Record<string, string>>({}); const [top, setTop] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return; setErrs({}); setTop(""); setBusy(false);
    setV({ typeId: s(edit?.type?.id), locationId: s(edit?.location?.id), name: s(edit?.name), tag: s(edit?.tag), manufacturer: s(edit?.manufacturer), model: s(edit?.model), serialNumber: s(edit?.serialNumber), installedOn: s(edit?.installedOn).slice(0, 10), description: s(edit?.description), notes: s(edit?.notes) });
    /* eslint-disable-next-line */
  }, [open, edit?.id]);
  const set = (k: string) => (x: string) => { setV((o) => ({ ...o, [k]: x })); setErrs((o) => ({ ...o, [k]: "" })); };
  const typeOptions = useMemo<[string, string][]>(() => {
    const items = cat.data?.items ?? []; const chosen = new Set((sys.data ?? []).filter((x) => x.selected).map((x) => x.systemId));
    const byId = new Map(items.map((i) => [i.id, i]));
    return items.filter((i) => i.kind === "TYPE").flatMap((t) => {
      const p = t.parentId ? byId.get(t.parentId) : undefined; const root = p?.kind === "SUBSYSTEM" ? (p.parentId ? byId.get(p.parentId) : undefined) : p;
      if (!root || !chosen.has(root.id)) return [];
      return [[t.id, [root.name, p?.kind === "SUBSYSTEM" ? p.name : null, t.name].filter(Boolean).join(" › ")] as [string, string]];
    });
  }, [cat.data, sys.data]);
  const locOptions = useMemo<[string, string][]>(() => {
    const t = tree.data; if (!t) return [];
    const byId = new Map(t.locations.map((l) => [l.id, l])); const bn = new Map(t.buildings.map((b) => [b.id, b.name]));
    const label = (l: Tree["locations"][number]): string => { const p = l.parentLocationId ? byId.get(l.parentLocationId) : undefined; return p ? `${label(p)} › ${l.name}` : `${l.buildingId ? bn.get(l.buildingId) + " › " : ""}${l.name}`; };
    return t.locations.filter((l) => l.status === "ACTIVE" || l.id === edit?.location?.id).map((l) => [l.id, label(l)]);
  }, [tree.data, edit?.location?.id]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const er: Record<string, string> = {};
    if (!edit && !v.typeId) er.typeId = "Campo obrigatório."; if (!v.name?.trim()) er.name = "Campo obrigatório.";
    setErrs(er); if (Object.keys(er).length) return setTop("Revise os campos destacados.");
    setBusy(true); setTop("");
    const { typeId, ...rest } = v; const body = { ...rest, locationId: v.locationId || null, ...(edit ? {} : { typeId }) };
    try {
      if (edit) await api(`/api/components/${edit.id}`, { method: "PUT", body }); else await api(`/api/projects/${projectId}/components`, { body });
      toast.ok(edit ? "Componente atualizado." : "Componente cadastrado."); onSaved();
    } catch (x) { if (x instanceof ApiError) { setErrs(x.fields); setTop(x.message); } else setTop("Não foi possível salvar."); setBusy(false); }
  }
  const noTypes = !edit && sys.data && cat.data && typeOptions.length === 0;
  return (
    <Modal open={open} onClose={onClose} title={edit ? "Editar componente" : "Novo componente"} onSubmit={submit} wide
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy || !!noTypes}>{busy ? "Salvando…" : "Salvar"}</button></>}>
      {top && <div className="alert alert-bad" role="alert" style={{ marginBottom: 12 }}>{top}</div>}
      {noTypes && <div className="alert alert-warn" style={{ marginBottom: 12 }}>Nenhum tipo disponível: selecione sistemas do catálogo na aba Sistemas deste empreendimento e verifique se há tipos ativos.</div>}
      <div className="grid">
        <div style={{ gridColumn: "span 12" }}>{edit
          ? <TextField label="Tipo de componente" name="typeId" value={edit.type?.name ?? ""} onChange={() => {}} disabled hint="O tipo não pode ser alterado depois do cadastro, para preservar o histórico." />
          : <SelectField label="Tipo de componente" name="typeId" required value={v.typeId ?? ""} onChange={set("typeId")} error={errs.typeId} options={typeOptions} placeholder="Selecione" hint="Mostra apenas tipos ativos de sistemas selecionados neste empreendimento." />}</div>
        <div className="c8"><TextField label="Nome" name="name" required value={v.name ?? ""} onChange={set("name")} error={errs.name} maxLength={200} autoFocus /></div>
        <div className="c4"><TextField label="Plaqueta / TAG" name="tag" value={v.tag ?? ""} onChange={set("tag")} error={errs.tag} maxLength={60} /></div>
        <div style={{ gridColumn: "span 12" }}><SelectField label="Local no empreendimento" name="locationId" value={v.locationId ?? ""} onChange={set("locationId")} error={errs.locationId} options={locOptions} placeholder="Sem local definido" /></div>
        <div className="c4"><TextField label="Fabricante" name="manufacturer" value={v.manufacturer ?? ""} onChange={set("manufacturer")} error={errs.manufacturer} maxLength={120} /></div>
        <div className="c4"><TextField label="Modelo" name="model" value={v.model ?? ""} onChange={set("model")} error={errs.model} maxLength={120} /></div>
        <div className="c4"><TextField label="Nº de série" name="serialNumber" value={v.serialNumber ?? ""} onChange={set("serialNumber")} error={errs.serialNumber} maxLength={120} /></div>
        <div className="c4"><TextField label="Instalado em" name="installedOn" type="date" value={v.installedOn ?? ""} onChange={set("installedOn")} error={errs.installedOn} /></div>
        <div style={{ gridColumn: "span 12" }}><TextArea label="Descrição" name="description" value={v.description ?? ""} onChange={set("description")} error={errs.description} maxLength={4000} /></div>
        <div style={{ gridColumn: "span 12" }}><TextArea label="Observações" name="notes" value={v.notes ?? ""} onChange={set("notes")} error={errs.notes} maxLength={4000} /></div>
      </div>
    </Modal>
  );
}

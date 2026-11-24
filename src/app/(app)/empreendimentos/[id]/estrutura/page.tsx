"use client";
import { useCallback, useMemo, useState } from "react";
import { api } from "@/ui/api";
import { useProject } from "@/components/ProjectContext";
import { BuildingModal, LocationModal, MoveModal } from "@/components/StructureModals";
import type { B, L, Sel, Target, Tree } from "@/components/structure-types";
import { Chevron, Empty, ErrorBox, Loading, StatusBadge, TextField, useAction, useCan, useConfirm, useFetch } from "@/ui/kit";
import { areaClassLabels, buildingTypeLabels, floorKindLabels, locationTypeLabels, unitTypeLabels } from "@/lib/labels";
import { formatArea } from "@/lib/format";

type Node = { key: string; kind: "b" | "l"; id: string; name: string; code: string; status: "ACTIVE" | "INACTIVE"; type: string; children: Node[] };

function Glyph({ type }: { type: string }) {
  const p = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (type) {
    case "BUILDING": return <svg {...p}><path d="M3 14V3h7v11M10 6h3v8M1.5 14h13M5.5 5.5h2M5.5 8h2M5.5 10.5h2" /></svg>;
    case "FLOOR": return <svg {...p}><path d="M2 5l6-3 6 3-6 3zM2 8.5l6 3 6-3M2 11.5l6 3 6-3" /></svg>;
    case "UNIT": return <svg {...p}><path d="M2.5 14V7L8 2.5 13.5 7v7zM6.5 14v-4h3v4" /></svg>;
    case "EXTERNAL_AREA": return <svg {...p}><path d="M8 14V8M8 8c-3 0-4-2-4-5 3 0 4 2 4 5zm0 2c0-2 1-3.5 4-3.5 0 2.5-1 3.5-4 3.5z" /></svg>;
    case "TECHNICAL_AREA": return <svg {...p}><circle cx="8" cy="8" r="2.2" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" /></svg>;
    default: return <svg {...p}><rect x="2.5" y="3.5" width="11" height="9" rx="1" /><path d="M2.5 8h11" /></svg>;
  }
}

function build(tree: Tree, showInactive: boolean): Node[] {
  const vis = (st: string) => showInactive || st === "ACTIVE";
  const kids = new Map<string, L[]>();
  for (const l of tree.locations) if (l.parentLocationId) kids.set(l.parentLocationId, [...(kids.get(l.parentLocationId) ?? []), l]);
  const loc = (l: L): Node => ({ key: `l:${l.id}`, kind: "l", id: l.id, name: l.name, code: l.code, status: l.status, type: l.locationType, children: (kids.get(l.id) ?? []).filter((c) => vis(c.status)).map(loc) });
  const roots = (bid: string | null) => tree.locations.filter((l) => !l.parentLocationId && l.buildingId === bid && vis(l.status)).map(loc);
  return [
    ...tree.buildings.filter((b) => vis(b.status)).map<Node>((b) => ({ key: `b:${b.id}`, kind: "b", id: b.id, name: b.name, code: b.code, status: b.status, type: "BUILDING", children: roots(b.id) })),
    ...roots(null),
  ];
}

function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? <>{text}</> : <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export default function StructurePage() {
  const { project } = useProject();
  const can = useCan(); const confirm = useConfirm(); const { busy, run } = useAction();
  const editable = can.write && project.status === "ACTIVE";
  const { data: tree, error, loading, reload } = useFetch<Tree>(`/api/projects/${project.id}/tree`);
  const [sel, setSel] = useState<Sel>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [bModal, setBModal] = useState<B | null | undefined>(undefined);
  const [lModal, setLModal] = useState<undefined | { edit: L } | { target: Target; type?: string }>(undefined);
  const [moving, setMoving] = useState<L | undefined>(undefined);

  const nodes = useMemo(() => (tree ? build(tree, showInactive) : []), [tree, showInactive]);
  const lById = useMemo(() => new Map((tree?.locations ?? []).map((l) => [l.id, l])), [tree]);
  const bById = useMemo(() => new Map((tree?.buildings ?? []).map((b) => [b.id, b])), [tree]);

  // busca: mantém correspondências e seus ancestrais, expandidos
  const { shown, forced } = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return { shown: null as Set<string> | null, forced: new Set<string>() };
    const keep = new Set<string>(), force = new Set<string>();
    const walk = (n: Node): boolean => {
      const own = n.name.toLowerCase().includes(term) || n.code.toLowerCase().includes(term);
      const kid = n.children.map(walk).some(Boolean);
      if (own || kid) keep.add(n.key);
      if (kid) force.add(n.key);
      return own || kid;
    };
    nodes.forEach(walk);
    return { shown: keep, forced: force };
  }, [q, nodes]);

  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const expandAll = () => { const s = new Set<string>(); const w = (n: Node) => { if (n.children.length) s.add(n.key); n.children.forEach(w); }; nodes.forEach(w); setOpen(s); };
  const after = useCallback((s?: Sel) => { if (s) { setSel(s); } reload(); }, [reload]);

  const selected = sel ? (sel.kind === "b" ? bById.get(sel.id) : lById.get(sel.id)) : undefined;
  const selKey = sel ? `${sel.kind}:${sel.id}` : null;

  function ancestors(l: L): string[] { const out: string[] = []; let cur = l.parentLocationId ? lById.get(l.parentLocationId) : undefined; while (cur) { out.unshift(cur.name); cur = cur.parentLocationId ? lById.get(cur.parentLocationId) : undefined; } return out; }
  function descendantsOf(id: string): number { return (tree?.locations ?? []).filter((l) => l.parentLocationId === id).reduce((s, l) => s + 1 + descendantsOf(l.id), 0); }

  function renderNode(n: Node, depth: number): React.ReactNode {
    if (shown && !shown.has(n.key)) return null;
    const isOpen = forced.has(n.key) || open.has(n.key);
    const hasKids = n.children.length > 0;
    return (
      <li key={n.key} role="none">
        <div className={`node${n.status === "INACTIVE" ? " off" : ""}`} role="treeitem" tabIndex={0} aria-level={depth + 1} aria-selected={selKey === n.key}
          aria-expanded={hasKids ? isOpen : undefined}
          onClick={() => setSel({ kind: n.kind, id: n.id })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel({ kind: n.kind, id: n.id }); }
            if (e.key === "ArrowRight" && hasKids && !isOpen) toggle(n.key);
            if (e.key === "ArrowLeft" && hasKids && isOpen) toggle(n.key);
          }}>
          <button type="button" tabIndex={-1} className={`tw${hasKids ? "" : " leaf"}`} data-open={isOpen} aria-label={isOpen ? "Recolher" : "Expandir"} onClick={(e) => { e.stopPropagation(); toggle(n.key); }}><Chevron /></button>
          <span className="gl"><Glyph type={n.type} /></span>
          <span className="lbl"><span className="nm"><Hl text={n.name} q={q.trim()} /></span><span className="cd mono"><Hl text={n.code} q={q.trim()} /></span></span>
          {n.status === "INACTIVE" && <span className="badge badge-off badge-plain">inativo</span>}
        </div>
        {hasKids && isOpen && <ul role="group">{n.children.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    );
  }

  async function reorder(kind: "b" | "l", id: string, direction: "up" | "down") {
    await run(() => api(`/api/${kind === "b" ? "buildings" : "locations"}/${id}/reorder`, { body: { direction } }));
    reload();
  }
  async function deactivate(kind: "b" | "l", id: string, name: string) {
    const n = kind === "l" ? descendantsOf(id) : (tree?.locations ?? []).filter((l) => l.buildingId === id).length;
    const r = await confirm({ title: `Desativar “${name}”?`, danger: true, confirmLabel: "Desativar",
      message: <>{n > 0 ? <>Os <b>{n}</b> itens internos também serão desativados. </> : null}Nada é apagado e é possível reativar depois.</> });
    if (!r.ok) return;
    await run(() => api(`/api/${kind === "b" ? "buildings" : "locations"}/${id}/deactivate`, { method: "POST" }), "Desativado.");
    reload();
  }
  async function reactivate(kind: "b" | "l", id: string, name: string, hasInner: boolean) {
    let includeDescendants = false;
    if (hasInner) {
      const r = await confirm({ title: `Reativar “${name}”?`, confirmLabel: "Reativar também os itens internos", message: "Escolha “Cancelar” para reativar apenas este item, sem os itens internos." });
      includeDescendants = r.ok;
    }
    await run(() => api(`/api/${kind === "b" ? "buildings" : "locations"}/${id}/reactivate`, { body: { includeDescendants } }), "Reativado.");
    reload();
  }

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !tree) return <Loading text="Carregando estrutura…" />;
  if (!tree) return null;

  const rootTarget = (mode: Target["mode"], label: string, buildingId: string | null, parent: string | null): Target => ({ mode, label, buildingId, parentLocationId: parent });
  const empty = tree.buildings.length === 0 && tree.locations.length === 0;

  return (
    <>
      <div className="structure">
        <section className="treebox" aria-label="Estrutura física">
          <div className="treebar">
            <TextField label="Buscar na estrutura" name="q" value={q} onChange={setQ} placeholder="Nome ou código" />
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <label className="checkline" style={{ minHeight: 0 }}><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostrar inativos</label>
              <span className="actions"><button className="btn btn-sm" onClick={expandAll}>Expandir tudo</button><button className="btn btn-sm" onClick={() => setOpen(new Set())}>Recolher</button></span>
            </div>
            {editable && <div className="actions"><button className="btn btn-sm btn-primary" onClick={() => setBModal(null)}>Nova edificação</button><button className="btn btn-sm" onClick={() => setLModal({ target: rootTarget("root", "área sem edificação", null, null) })}>Nova área sem edificação</button></div>}
          </div>
          <div className="treescroll">
            {empty ? <Empty title="Estrutura vazia">{editable ? "Comece criando uma edificação (bloco, torre…) ou uma área externa." : "Nenhuma edificação ou área cadastrada."}</Empty>
              : shown && shown.size === 0 ? <p className="muted" style={{ padding: 16 }}>Nada encontrado para “{q}”.</p>
              : <ul className="tree" role="tree" aria-label="Edificações e localizações">{nodes.map((n) => renderNode(n, 0))}</ul>}
          </div>
        </section>

        <aside className="detail" aria-live="polite" aria-label="Detalhes">
          {!selected ? <p className="muted">Selecione um item da árvore para ver os detalhes e as ações disponíveis.</p> : sel!.kind === "b" ? (() => {
            const b = selected as B;
            const inner = tree.locations.filter((l) => l.buildingId === b.id);
            const floors = inner.filter((l) => l.locationType === "FLOOR");
            return (<>
              <div className="path">Edificação</div>
              <h2>{b.name}</h2>
              <div className="tags"><span className="badge badge-plain mono">{b.code}</span><span className="badge badge-plain">{buildingTypeLabels[b.buildingType as keyof typeof buildingTypeLabels]}</span><StatusBadge status={b.status} /></div>
              <dl className="kv">
                <dt>Pavimentos</dt><dd>{floors.filter((f) => f.status === "ACTIVE").length}</dd>
                <dt>Itens internos</dt><dd>{inner.filter((f) => f.status === "ACTIVE").length}</dd>
                <dt>Área construída</dt><dd>{formatArea(b.builtAreaM2)}</dd>
                <dt>Ano de construção</dt><dd>{b.constructionYear}</dd>
                <dt>Descrição</dt><dd style={{ whiteSpace: "pre-wrap" }}>{b.description}</dd>
                <dt>Observações</dt><dd style={{ whiteSpace: "pre-wrap" }}>{b.notes}</dd>
              </dl>
              {editable && <div className="actions">
                {b.status === "ACTIVE" && <><button className="btn btn-sm btn-primary" onClick={() => setLModal({ target: rootTarget("floor", `pavimento em ${b.name}`, b.id, null) })}>Novo pavimento</button>
                  <button className="btn btn-sm" onClick={() => setLModal({ target: rootTarget("child", `em ${b.name}`, b.id, null) })}>Novo ambiente/área</button>
                  <button className="btn btn-sm" onClick={() => setBModal(b)}>Editar</button></>}
                <button className="btn btn-sm" disabled={busy} onClick={() => reorder("b", b.id, "up")} aria-label="Mover para cima">↑</button>
                <button className="btn btn-sm" disabled={busy} onClick={() => reorder("b", b.id, "down")} aria-label="Mover para baixo">↓</button>
                {b.status === "ACTIVE" ? <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => deactivate("b", b.id, b.name)}>Desativar</button> : <button className="btn btn-sm" disabled={busy} onClick={() => reactivate("b", b.id, b.name, inner.length > 0)}>Reativar</button>}
              </div>}
            </>);
          })() : (() => {
            const l = selected as L;
            const b = l.buildingId ? bById.get(l.buildingId) : undefined;
            const path = [b?.name ?? "Sem edificação", ...ancestors(l)].join(" › ");
            const inner = descendantsOf(l.id);
            const canAddChild = l.status === "ACTIVE";
            return (<>
              <div className="path">{path}</div>
              <h2>{l.name}</h2>
              <div className="tags"><span className="badge badge-plain mono">{l.code}</span><span className="badge badge-plain">{locationTypeLabels[l.locationType as keyof typeof locationTypeLabels]}</span>
                {l.locationType !== "UNIT" && <span className={`badge badge-plain ${l.areaClass === "COMMON" ? "badge-ok" : ""}`}>{areaClassLabels[l.areaClass as keyof typeof areaClassLabels]}</span>}<StatusBadge status={l.status} /></div>
              <dl className="kv">
                {l.locationType === "FLOOR" && <><dt>Tipo de pavimento</dt><dd>{l.floorKind ? floorKindLabels[l.floorKind as keyof typeof floorKindLabels] : null}</dd><dt>Ordem (nível)</dt><dd>{l.floorOrder}</dd><dt>Cota</dt><dd>{l.elevationM != null ? `${l.elevationM} m` : null}</dd></>}
                {l.unit && <><dt>Tipo de unidade</dt><dd>{unitTypeLabels[l.unit.unitType as keyof typeof unitTypeLabels]}</dd><dt>Área privativa</dt><dd>{formatArea(l.unit.privateAreaM2)}</dd></>}
                <dt>Área</dt><dd>{formatArea(l.areaM2)}</dd>
                <dt>Itens internos</dt><dd>{inner}</dd>
                <dt>Descrição</dt><dd style={{ whiteSpace: "pre-wrap" }}>{l.description}</dd>
              </dl>
              {editable && <div className="actions">
                {canAddChild && <button className="btn btn-sm btn-primary" onClick={() => setLModal({ target: rootTarget("child", `em ${l.name}`, l.buildingId, l.id) })}>Adicionar item interno</button>}
                {canAddChild && <button className="btn btn-sm" onClick={() => setLModal({ edit: l })}>Editar</button>}
                {canAddChild && <button className="btn btn-sm" onClick={() => setMoving(l)}>Mover…</button>}
                <button className="btn btn-sm" disabled={busy} onClick={() => reorder("l", l.id, "up")} aria-label="Mover para cima">↑</button>
                <button className="btn btn-sm" disabled={busy} onClick={() => reorder("l", l.id, "down")} aria-label="Mover para baixo">↓</button>
                {l.status === "ACTIVE" ? <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => deactivate("l", l.id, l.name)}>Desativar</button> : <button className="btn btn-sm" disabled={busy} onClick={() => reactivate("l", l.id, l.name, inner > 0)}>Reativar</button>}
              </div>}
            </>);
          })()}
        </aside>
      </div>

      <BuildingModal projectId={project.id} building={bModal} onClose={() => setBModal(undefined)} onSaved={(id) => { setBModal(undefined); after({ kind: "b", id }); }} />
      <LocationModal projectId={project.id} state={lModal} onClose={() => setLModal(undefined)}
        onSaved={(id) => { setLModal(undefined); setOpen((s) => new Set(s).add(sel ? `${sel.kind}:${sel.id}` : "")); after({ kind: "l", id }); }} />
      <MoveModal tree={tree} item={moving} onClose={() => setMoving(undefined)} onMoved={(id) => { setMoving(undefined); after({ kind: "l", id }); }} />
    </>
  );
}

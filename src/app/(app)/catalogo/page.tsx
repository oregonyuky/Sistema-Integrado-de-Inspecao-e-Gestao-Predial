"use client";
import { useMemo, useState } from "react";
import { api } from "@/ui/api";
import { CatalogItemModal, CriterionModal, NormLinkModal, type ItemModalState } from "@/components/CatalogModals";
import type { CatItem, Criterion, NormLink } from "@/components/catalog-types";
import { Chevron, Empty, ErrorBox, Loading, StatusBadge, TextField, useAction, useCan, useConfirm, useFetch } from "@/ui/kit";
import { catalogKindLabels, criterionResponseLabels } from "@/lib/labels";

type Node = { item: CatItem; children: Node[] };

function Glyph({ kind }: { kind: CatItem["kind"] }) {
  const p = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (kind === "SYSTEM") return <svg {...p}><circle cx="8" cy="8" r="2.2" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" /></svg>;
  if (kind === "SUBSYSTEM") return <svg {...p}><path d="M2 5l6-3 6 3-6 3zM2 8.5l6 3 6-3M2 11.5l6 3 6-3" /></svg>;
  return <svg {...p}><path d="M2.5 4.5L8 2l5.5 2.5v7L8 14l-5.5-2.5zM2.5 4.5L8 7l5.5-2.5M8 7v7" /></svg>;
}

function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? <>{text}</> : <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export default function CatalogPage() {
  const can = useCan(); const confirm = useConfirm(); const { busy, run } = useAction();
  const { data, error, loading, reload } = useFetch<{ items: CatItem[] }>("/api/catalog");
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState(""); const [showInactive, setShowInactive] = useState(false);
  const [itemModal, setItemModal] = useState<ItemModalState>(undefined);
  const [critModal, setCritModal] = useState<Criterion | null | undefined>(undefined);
  const [linkModal, setLinkModal] = useState(false);
  const [tab, setTab] = useState<"criteria" | "norms">("criteria");

  const items = data?.items ?? [];
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const roots = useMemo(() => {
    const vis = (i: CatItem) => showInactive || i.status === "ACTIVE";
    const mk = (i: CatItem): Node => ({ item: i, children: items.filter((c) => c.parentId === i.id && vis(c)).map(mk) });
    return items.filter((i) => !i.parentId && vis(i)).map(mk);
  }, [items, showInactive]);

  const { shown, forced } = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return { shown: null as Set<string> | null, forced: new Set<string>() };
    const keep = new Set<string>(), force = new Set<string>();
    const walk = (n: Node): boolean => {
      const own = n.item.name.toLowerCase().includes(term) || n.item.code.toLowerCase().includes(term);
      const kid = n.children.map(walk).some(Boolean);
      if (own || kid) keep.add(n.item.id);
      if (kid) force.add(n.item.id);
      return own || kid;
    };
    roots.forEach(walk);
    return { shown: keep, forced: force };
  }, [q, roots]);

  const selected = sel ? byId.get(sel) : undefined;
  const crit = useFetch<Criterion[]>(selected?.kind === "TYPE" ? `/api/catalog/${selected.id}/criteria` : null);
  const norms = useFetch<NormLink[]>(selected ? `/api/catalog/${selected.id}/norms` : null);
  const path = (i: CatItem) => { const out: string[] = []; let c: CatItem | undefined = i; while (c) { out.unshift(c.name); c = c.parentId ? byId.get(c.parentId) : undefined; } return out; };
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll = () => { const s = new Set<string>(); const w = (n: Node) => { if (n.children.length) s.add(n.item.id); n.children.forEach(w); }; roots.forEach(w); setOpen(s); };

  function renderNode(n: Node, depth: number): React.ReactNode {
    if (shown && !shown.has(n.item.id)) return null;
    const i = n.item; const isOpen = forced.has(i.id) || open.has(i.id); const has = n.children.length > 0;
    return (
      <li key={i.id} role="none">
        <div className={`node${i.status === "INACTIVE" ? " off" : ""}`} role="treeitem" tabIndex={0} aria-level={depth + 1} aria-selected={sel === i.id} aria-expanded={has ? isOpen : undefined}
          onClick={() => setSel(i.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(i.id); }
            if (e.key === "ArrowRight" && has && !isOpen) toggle(i.id);
            if (e.key === "ArrowLeft" && has && isOpen) toggle(i.id);
          }}>
          <button type="button" tabIndex={-1} className={`tw${has ? "" : " leaf"}`} data-open={isOpen} aria-label={isOpen ? "Recolher" : "Expandir"} onClick={(e) => { e.stopPropagation(); toggle(i.id); }}><Chevron /></button>
          <span className="gl"><Glyph kind={i.kind} /></span>
          <span className="lbl"><span className="nm"><Hl text={i.name} q={q.trim()} /></span><span className="cd mono"><Hl text={i.code} q={q.trim()} /></span></span>
          {i.status === "INACTIVE" && <span className="badge badge-off badge-plain">inativo</span>}
        </div>
        {has && isOpen && <ul role="group">{n.children.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    );
  }

  async function deactivate(i: CatItem) {
    const inner = items.filter((x) => { let c: CatItem | undefined = x; while (c) { if (c.parentId === i.id) return true; c = c.parentId ? byId.get(c.parentId) : undefined; } return false; }).length;
    const r = await confirm({ title: `Desativar “${i.name}”?`, danger: true, confirmLabel: "Desativar", message: <>{inner > 0 ? <>Os <b>{inner}</b> itens internos também serão desativados. </> : null}Eles deixam de aparecer para novos cadastros. Componentes já cadastrados, critérios e vínculos <b>são mantidos</b> e continuam consultáveis.</> });
    if (!r.ok) return;
    await run(() => api(`/api/catalog/${i.id}/deactivate`, { method: "POST" }), "Item desativado."); reload();
  }
  async function reactivate(i: CatItem) {
    const has = items.some((x) => x.parentId === i.id);
    let includeDescendants = false;
    if (has) { const r = await confirm({ title: `Reativar “${i.name}”?`, confirmLabel: "Reativar também os itens internos", message: "Escolha “Cancelar” para reativar apenas este item." }); includeDescendants = r.ok; }
    await run(() => api(`/api/catalog/${i.id}/reactivate`, { body: { includeDescendants } }), "Item reativado."); reload();
  }
  async function critStatus(k: Criterion) {
    await run(() => api(`/api/criteria/${k.id}/${k.status === "ACTIVE" ? "deactivate" : "reactivate"}`, { method: "POST" }), k.status === "ACTIVE" ? "Critério desativado." : "Critério reativado."); crit.reload(); reload();
  }
  async function critMove(k: Criterion, direction: "up" | "down") { await run(() => api(`/api/criteria/${k.id}/reorder`, { body: { direction } })); crit.reload(); }
  async function unlink(l: NormLink) {
    const r = await confirm({ title: "Remover vínculo com a norma?", danger: true, confirmLabel: "Remover", message: <>{l.normCode} — seção {l.sectionRef}. A norma e a seção continuam cadastradas.</> });
    if (!r.ok) return;
    await run(() => api(`/api/catalog-norm-links/${l.id}`, { method: "DELETE" }), "Vínculo removido."); norms.reload(); reload();
  }

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <Loading text="Carregando catálogo…" />;

  return (
    <>
      <div className="pagehead"><div><h1>Catálogo técnico</h1><p className="meta">Biblioteca mestre de sistemas, subsistemas e tipos de componentes, com critérios de inspeção e normas aplicáveis. Vale para todos os empreendimentos da organização.</p></div></div>
      <div className="structure">
        <section className="treebox" aria-label="Catálogo">
          <div className="treebar">
            <TextField label="Buscar no catálogo" name="q" value={q} onChange={setQ} placeholder="Nome ou código" />
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <label className="checkline" style={{ minHeight: 0 }}><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Mostrar inativos</label>
              <span className="actions"><button className="btn btn-sm" onClick={expandAll}>Expandir tudo</button><button className="btn btn-sm" onClick={() => setOpen(new Set())}>Recolher</button></span>
            </div>
            {can.write && <div className="actions"><button className="btn btn-sm btn-primary" onClick={() => setItemModal({ mode: "create", kind: "SYSTEM", parentId: null })}>Novo sistema</button></div>}
          </div>
          <div className="treescroll">
            {items.length === 0 ? <Empty title="Catálogo vazio">{can.write ? "Crie o primeiro sistema (ex.: Instalações elétricas) e depois seus subsistemas e tipos de componentes." : "Nenhum sistema cadastrado."}</Empty>
              : shown && shown.size === 0 ? <p className="muted" style={{ padding: 16 }}>Nada encontrado para “{q}”.</p>
              : <ul className="tree" role="tree" aria-label="Sistemas, subsistemas e tipos">{roots.map((n) => renderNode(n, 0))}</ul>}
          </div>
        </section>

        <aside className="detail" aria-live="polite" aria-label="Detalhes do item">
          {!selected ? <p className="muted">Selecione um item do catálogo para ver detalhes, critérios de inspeção e normas aplicáveis.</p> : (<>
            <div className="path">{path(selected).slice(0, -1).join(" › ") || catalogKindLabels[selected.kind]}</div>
            <h2>{selected.name}</h2>
            <div className="tags"><span className="badge badge-plain mono">{selected.code}</span><span className="badge badge-plain">{catalogKindLabels[selected.kind]}</span><StatusBadge status={selected.status} />
              {selected.kind === "TYPE" && <span className="badge badge-plain">{selected.componentCount} componente(s) ativo(s)</span>}</div>
            {selected.description && <p style={{ whiteSpace: "pre-wrap", marginBottom: 12 }}>{selected.description}</p>}
            {can.write && <div className="actions" style={{ marginBottom: 14 }}>
              {selected.status === "ACTIVE" && selected.kind === "SYSTEM" && <button className="btn btn-sm btn-primary" onClick={() => setItemModal({ mode: "create", kind: "SUBSYSTEM", parentId: selected.id })}>Novo subsistema</button>}
              {selected.status === "ACTIVE" && selected.kind !== "TYPE" && <button className="btn btn-sm" onClick={() => setItemModal({ mode: "create", kind: "TYPE", parentId: selected.id })}>Novo tipo de componente</button>}
              {selected.status === "ACTIVE" && <button className="btn btn-sm" onClick={() => setItemModal({ mode: "edit", item: selected })}>Editar / mover</button>}
              {can.admin && (selected.status === "ACTIVE" ? <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => deactivate(selected)}>Desativar</button> : <button className="btn btn-sm" disabled={busy} onClick={() => reactivate(selected)}>Reativar</button>)}
            </div>}
            {!can.admin && can.write && <p className="hint" style={{ marginBottom: 10 }}>Desativar itens do catálogo exige perfil de administrador.</p>}

            <nav className="tabs" aria-label="Seções do item" style={{ marginBottom: 14 }}>
              {selected.kind === "TYPE" && <button type="button" aria-selected={tab === "criteria"} onClick={() => setTab("criteria")}>Critérios de inspeção</button>}
              <button type="button" aria-selected={tab === "norms" || selected.kind !== "TYPE"} onClick={() => setTab("norms")}>Normas aplicáveis</button>
            </nav>

            {selected.kind === "TYPE" && tab === "criteria" && (<>
              {crit.error ? <ErrorBox error={crit.error} onRetry={crit.reload} /> : crit.loading && !crit.data ? <Loading /> : !crit.data?.length ? (
                <p className="muted">Nenhum critério configurado. O formulário de inspeção deste tipo é montado a partir dos critérios abaixo.</p>
              ) : (
                <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {crit.data.map((k, idx) => (
                    <li key={k.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--rule-2)", opacity: k.status === "INACTIVE" ? 0.6 : 1 }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
                        <div style={{ minWidth: 0 }}>
                          <b>{k.label}</b> {k.required && <span className="req" title="Obrigatório">*</span>}
                          <div className="sub muted"><span className="mono">{k.code}</span> · {criterionResponseLabels[k.responseType]}
                            {k.responseType === "NUMBER" && (k.unit || k.minValue !== null || k.maxValue !== null) ? ` · ${k.minValue ?? "…"} a ${k.maxValue ?? "…"} ${k.unit ?? ""}` : ""}
                            {k.responseType === "SINGLE_CHOICE" ? ` · ${k.options.join(" / ")}` : ""}
                            {k.status === "INACTIVE" ? " · inativo" : ""}</div>
                        </div>
                        {can.write && <div className="rowact" style={{ display: "flex", gap: 2 }}>
                          <button className="btn btn-quiet btn-sm" disabled={busy || idx === 0} aria-label={`Subir ${k.code}`} onClick={() => critMove(k, "up")}>↑</button>
                          <button className="btn btn-quiet btn-sm" disabled={busy || idx === crit.data!.length - 1} aria-label={`Descer ${k.code}`} onClick={() => critMove(k, "down")}>↓</button>
                          <button className="btn btn-quiet btn-sm" onClick={() => setCritModal(k)}>Editar</button>
                          <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => critStatus(k)}>{k.status === "ACTIVE" ? "Desativar" : "Reativar"}</button>
                        </div>}
                      </div>
                    </li>))}
                </ol>)}
              {can.write && selected.status === "ACTIVE" && <div className="actions" style={{ marginTop: 12 }}><button className="btn btn-sm btn-primary" onClick={() => setCritModal(null)}>Novo critério</button></div>}
            </>)}

            {(tab === "norms" || selected.kind !== "TYPE") && (<>
              {norms.error ? <ErrorBox error={norms.error} onRetry={norms.reload} /> : norms.loading && !norms.data ? <Loading /> : !norms.data?.length ? (
                <p className="muted">Nenhuma norma vinculada a este item{selected.kind !== "SYSTEM" ? " nem aos itens acima dele" : ""}.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {norms.data.map((l) => (
                    <li key={l.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--rule-2)" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
                        <div style={{ minWidth: 0 }}>
                          <b>{l.normCode}</b> <span className="muted">· ed. {l.edition}</span> {l.isCurrentEdition && <span className="badge badge-ok">Vigente</span>}
                          <div className="sub">Seção {l.sectionRef} — {l.sectionTitle}</div>
                          {l.notes && <div className="sub muted">{l.notes}</div>}
                          {!l.direct && <div className="sub muted">Herdada de “{l.inheritedFrom}”</div>}
                        </div>
                        {can.write && l.direct && <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => unlink(l)}>Remover</button>}
                      </div>
                    </li>))}
                </ul>)}
              {can.write && selected.status === "ACTIVE" && <div className="actions" style={{ marginTop: 12 }}><button className="btn btn-sm btn-primary" onClick={() => setLinkModal(true)}>Vincular norma</button></div>}
            </>)}
          </>)}
        </aside>
      </div>

      <CatalogItemModal items={items} state={itemModal} onClose={() => setItemModal(undefined)}
        onSaved={(id) => { setItemModal(undefined); setSel(id); reload(); }} />
      {selected?.kind === "TYPE" && <CriterionModal typeId={selected.id} state={critModal} onClose={() => setCritModal(undefined)} onSaved={() => { setCritModal(undefined); crit.reload(); reload(); }} />}
      {selected && <NormLinkModal itemId={selected.id} open={linkModal} onClose={() => setLinkModal(false)} onSaved={() => { setLinkModal(false); norms.reload(); reload(); }} />}
    </>
  );
}

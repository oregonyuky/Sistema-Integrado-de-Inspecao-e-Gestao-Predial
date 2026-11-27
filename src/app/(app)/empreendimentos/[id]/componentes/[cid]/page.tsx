"use client";
import Link from "next/link";
import { use, useState } from "react";
import { useProject } from "@/components/ProjectContext";
import { ComponentModal, type CompData } from "@/components/ComponentModal";
import { Empty, ErrorBox, Loading, StatusBadge, useCan, useFetch } from "@/ui/kit";
import { criterionResponseLabels } from "@/lib/labels";

type Detail = CompData & {
  publicCode: string; status: "ACTIVE" | "INACTIVE"; createdAt: string; updatedAt: string; deactivatedAt: string | null;
  system: { name: string } | null; subsystem: { name: string } | null; location: { id: string; name: string; path: string[] | null } | null;
  norms: { linkId: string; inheritedFrom: string | null; notes: string | null; sectionRef: string; sectionTitle: string; edition: string; normCode: string; normTitle: string }[];
  form: { id: string; code: string; label: string; responseType: keyof typeof criterionResponseLabels; required: boolean; unit: string | null; options: string[] }[];
};
type Hist = { items: { id: string; action: string; createdAt: string; user: string | null; changes?: Record<string, unknown> | null }[]; sources: { cadastro: boolean; inspecoes: boolean; ocorrencias: boolean } };
const actionLabels: Record<string, string> = { CREATE: "Cadastro", UPDATE: "Edição", DEACTIVATE: "Desativação", REACTIVATE: "Reativação" };
const fmt = (d: string) => new Date(d).toLocaleString("pt-BR");

export default function ComponentDetailPage({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = use(params); const { project } = useProject(); const can = useCan();
  const { data, error, loading, reload } = useFetch<Detail>(`/api/components/${cid}`);
  const hist = useFetch<Hist>(`/api/components/${cid}/history`);
  const [edit, setEdit] = useState(false);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;
  const editable = can.write && project.status === "ACTIVE" && data.status === "ACTIVE";
  const row = (k: string, v: React.ReactNode) => <><dt>{k}</dt><dd>{v || <span className="muted">Não informado</span>}</dd></>;
  return (
    <div className="stack">
      <nav className="crumbs" aria-label="Voltar"><Link href={`/empreendimentos/${project.id}/componentes`}>← Componentes</Link></nav>
      <section className="panel">
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
          <div><h2 style={{ margin: 0 }}>{data.name}</h2><div className="meta"><span className="mono" title="Identificador único e imutável">{data.publicCode}</span><StatusBadge status={data.status} /></div></div>
          {editable && <button className="btn btn-primary" onClick={() => setEdit(true)}>Editar</button>}
        </div>
        {data.status === "INACTIVE" && <div className="alert alert-warn" style={{ margin: "12px 0" }}>Componente desativado{data.deactivatedAt ? ` em ${fmt(data.deactivatedAt)}` : ""}. Continua consultável, com todo o histórico.</div>}
        <dl className="kv" style={{ marginTop: 14 }}>
          {row("Sistema", [data.system?.name, data.subsystem?.name].filter(Boolean).join(" › "))}
          {row("Tipo", data.type?.name)}
          {row("Local", data.location ? (data.location.path ?? [data.location.name]).join(" › ") : null)}
          {row("Plaqueta / TAG", data.tag)}{row("Fabricante", data.manufacturer)}{row("Modelo", data.model)}{row("Nº de série", data.serialNumber)}
          {row("Instalado em", data.installedOn ? new Date(data.installedOn.slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR") : null)}
          {row("Descrição", data.description)}{row("Observações", data.notes)}
        </dl>
      </section>
      <section className="panel"><h2>Formulário de inspeção do tipo</h2>
        {!data.form.length ? <p className="muted">O tipo não tem critérios ativos. Configure-os no Catálogo técnico.</p> : (
          <ol style={{ margin: 0, paddingLeft: 20 }}>{data.form.map((k) => (<li key={k.id} style={{ padding: "4px 0" }}><b>{k.label}</b>{k.required && <span className="req"> *</span>} <span className="muted">— {criterionResponseLabels[k.responseType]}{k.unit ? ` (${k.unit})` : ""}{k.options.length ? `: ${k.options.join(" / ")}` : ""}</span></li>))}</ol>)}
      </section>
      <section className="panel"><h2>Normas aplicáveis</h2>
        {!data.norms.length ? <p className="muted">Nenhuma norma vinculada ao tipo, subsistema ou sistema deste componente.</p> : (
          <ul style={{ margin: 0, paddingLeft: 20 }}>{data.norms.map((n) => (<li key={n.linkId}><b>{n.normCode}</b> (ed. {n.edition}) — seção {n.sectionRef}: {n.sectionTitle}{n.inheritedFrom && <span className="muted"> · herdada de {n.inheritedFrom}</span>}</li>))}</ul>)}
      </section>
      <section className="panel"><h2>Histórico do componente</h2>
        {hist.data && !hist.data.sources.inspecoes && <div className="alert alert-info" style={{ marginBottom: 12 }}>Por enquanto o histórico mostra apenas as alterações de cadastro. Inspeções e ocorrências aparecerão aqui quando esses módulos forem implementados.</div>}
        {hist.error ? <ErrorBox error={hist.error} onRetry={hist.reload} /> : !hist.data ? <Loading /> : !hist.data.items.length ? <Empty title="Sem registros" /> : (
          <ol className="timeline">{hist.data.items.map((h) => (<li key={h.id} className="tl"><b>{actionLabels[h.action] ?? h.action}</b> <span className="muted">· {fmt(h.createdAt)}{h.user ? ` · ${h.user}` : ""}</span></li>))}</ol>)}
      </section>
      <ComponentModal projectId={project.id} open={edit} component={data} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); hist.reload(); }} />
    </div>
  );
}

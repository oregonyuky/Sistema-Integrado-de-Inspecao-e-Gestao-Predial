"use client";
import Link from "next/link";
import { api } from "@/ui/api";
import { useProject } from "@/components/ProjectContext";
import { Empty, ErrorBox, Loading, useAction, useCan, useConfirm, useFetch } from "@/ui/kit";

type Sys = { systemId: string; code: string; name: string; description: string | null; catalogStatus: "ACTIVE" | "INACTIVE"; selected: boolean; notes: string | null; selectedSince: string | null; componentCount: number };

export default function ProjectSystemsPage() {
  const { project } = useProject(); const can = useCan(); const confirm = useConfirm(); const { busy, run } = useAction();
  const { data, error, loading, reload } = useFetch<Sys[]>(`/api/projects/${project.id}/systems`);
  const editable = can.write && project.status === "ACTIVE";
  async function select(s: Sys) { await run(() => api(`/api/projects/${project.id}/systems`, { body: { systemId: s.systemId } }), `${s.name} selecionado.`); reload(); }
  async function remove(s: Sys) {
    const r = await confirm({ title: `Remover “${s.name}” deste empreendimento?`, danger: true, confirmLabel: "Remover", message: "Novos componentes deste sistema não poderão mais ser cadastrados aqui. O catálogo não é alterado." });
    if (!r.ok) return;
    await run(() => api(`/api/projects/${project.id}/systems/${s.systemId}`, { method: "DELETE" }), "Sistema removido do empreendimento."); reload();
  }
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const sel = (data ?? []).filter((s) => s.selected); const rest = (data ?? []).filter((s) => !s.selected && s.catalogStatus === "ACTIVE");
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>Escolha, entre os sistemas do <Link href="/catalogo">catálogo técnico</Link>, quais existem neste empreendimento. Só é possível cadastrar componentes de sistemas selecionados.</p>
      <section className="panel"><h2>Sistemas do empreendimento ({sel.length})</h2>
        {sel.length === 0 ? <Empty title="Nenhum sistema selecionado">Selecione abaixo os sistemas presentes neste empreendimento.</Empty> : (
          <div className="tablewrap"><table className="t"><thead><tr><th>Código</th><th>Sistema</th><th>Componentes ativos</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>
            {sel.map((s) => (<tr key={s.systemId}><td className="mono">{s.code}</td><td><b>{s.name}</b>{s.catalogStatus === "INACTIVE" && <span className="badge badge-off badge-plain" style={{ marginLeft: 6 }}>inativo no catálogo</span>}</td>
              <td><Link href={`/empreendimentos/${project.id}/componentes?systemId=${s.systemId}`}>{s.componentCount}</Link></td>
              <td className="rowact">{editable && <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => remove(s)}>Remover</button>}</td></tr>))}
          </tbody></table></div>)}
      </section>
      <section className="panel"><h2>Disponíveis no catálogo ({rest.length})</h2>
        {rest.length === 0 ? <p className="muted">Todos os sistemas ativos do catálogo já estão selecionados{(data ?? []).length === 0 ? " (o catálogo ainda está vazio)" : ""}.</p> : (
          <div className="tablewrap"><table className="t"><tbody>
            {rest.map((s) => (<tr key={s.systemId}><td className="mono">{s.code}</td><td><b>{s.name}</b>{s.description && <div className="sub muted">{s.description}</div>}</td>
              <td className="rowact">{editable && <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => select(s)}>Selecionar</button>}</td></tr>))}
          </tbody></table></div>)}
      </section>
    </div>
  );
}

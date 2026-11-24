"use client";
import Link from "next/link";
import { useProject } from "@/components/ProjectContext";
import { ErrorBox, Loading, useCan, useFetch } from "@/ui/kit";
import { projectTypeLabels, responsibleRoleLabels, useTypeLabels } from "@/lib/labels";
import { formatArea, formatDate, formatDateTime, formatZip } from "@/lib/format";

type Ind = { active: number; inactive?: number };
type Overview = {
  project: { characteristics: Record<string, number | string | null> | null; addressLine: string; addressNumber: string | null; complement: string | null; district: string | null; city: string; state: string; zipCode: string | null; latitude: number | null; longitude: number | null; description: string | null; projectType: keyof typeof projectTypeLabels };
  indicators: { buildings: Ind; floors: Ind; environments: Ind; units: Ind; commonAreas: Ind };
  responsibles: { id: string; role: keyof typeof responsibleRoleLabels; roleDetail: string | null; startDate: string; responsible: { name: string; companyName: string | null } }[];
  lastUpdate: string;
};

export default function OverviewPage() {
  const { project } = useProject();
  const can = useCan();
  const { data, error, loading, reload } = useFetch<Overview>(`/api/projects/${project.id}/overview`);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;
  const p = data.project, ch = p.characteristics, ind = data.indicators;
  const cards: [string, Ind, string][] = [
    ["Edificações", ind.buildings, "blocos, torres e auxiliares"], ["Pavimentos", ind.floors, ""], ["Ambientes", ind.environments, "salas, circulações, áreas técnicas e externas"],
    ["Unidades privativas", ind.units, ""], ["Áreas comuns", ind.commonAreas, ""],
  ];
  const addr = [p.addressLine && `${p.addressLine}${p.addressNumber ? `, ${p.addressNumber}` : ""}`, p.complement, p.district, `${p.city}/${p.state}`, p.zipCode && formatZip(p.zipCode)].filter(Boolean).join(" — ");
  const age = ch?.ageYears != null ? `${ch.ageYears} anos (${ch.ageSource === "calculated" ? "calculada pelo ano de construção" : "estimada"})` : null;

  return (
    <>
      <div className="actions" style={{ marginBottom: 18 }}>
        {can.write && project.status === "ACTIVE" && <Link href={`/empreendimentos/${project.id}/editar`} className="btn">Editar dados</Link>}
        <Link href={`/empreendimentos/${project.id}/estrutura`} className="btn">Abrir estrutura física</Link>
        <span className="muted" style={{ marginLeft: "auto", fontSize: "0.85rem" }}>Última atualização: {formatDateTime(data.lastUpdate)}</span>
      </div>
      <section aria-labelledby="ind" style={{ marginBottom: 22 }}>
        <h2 id="ind" className="sr-only">Indicadores</h2>
        <div className="panel"><dl className="counts" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", columnGap: 24 }}>
          {cards.map(([label, i, hint]) => (
            <div key={label} title={hint}><dt>{label}</dt><dd>{i.active}{!!i.inactive && <small>+{i.inactive} inativ{i.inactive > 1 ? "os" : "o"}</small>}</dd></div>
          ))}
        </dl><p className="hint" style={{ marginTop: 10 }}>Valores calculados a partir dos registros cadastrados; contagens consideram apenas itens ativos.</p></div>
      </section>
      <div className="cols">
        <div style={{ display: "grid", gap: 20 }}>
          <section className="panel" aria-labelledby="gen"><h2 id="gen">Dados gerais</h2>
            <dl className="kv">
              <dt>Tipo</dt><dd>{projectTypeLabels[p.projectType]}</dd>
              <dt>Cliente</dt><dd><Link href={`/clientes/${project.client.id}`}>{project.client.name}</Link></dd>
              <dt>Endereço</dt><dd>{addr}</dd>
              <dt>Coordenadas</dt><dd>{p.latitude != null && p.longitude != null ? <span className="mono">{p.latitude}, {p.longitude}</span> : null}</dd>
              <dt>Descrição</dt><dd style={{ whiteSpace: "pre-wrap" }}>{p.description}</dd>
            </dl></section>
          <section className="panel" aria-labelledby="car"><h2 id="car">Caracterização técnica</h2>
            {!ch ? <p className="muted">Caracterização ainda não preenchida. {can.write && <Link href={`/empreendimentos/${project.id}/editar#caracterizacao`}>Preencher</Link>}</p> : (
              <dl className="kv">
                <dt>Área do terreno</dt><dd>{formatArea(ch.landAreaM2 as number)}</dd>
                <dt>Área construída</dt><dd>{formatArea(ch.builtAreaM2 as number)}</dd>
                <dt>Ano de construção</dt><dd>{ch.constructionYear}</dd>
                <dt>Idade</dt><dd>{age}</dd>
                <dt>Tipo de uso</dt><dd>{ch.useType ? useTypeLabels[ch.useType as keyof typeof useTypeLabels] : null}</dd>
                <dt>Ocupação</dt><dd>{ch.occupancyType}</dd>
                <dt>Tipologia</dt><dd>{ch.constructionTypology}</dd>
                <dt>Sistema predominante</dt><dd>{ch.predominantSystem}</dd>
                <dt>Estrutura</dt><dd style={{ whiteSpace: "pre-wrap" }}>{ch.structureInfo}</dd>
                <dt>Ampliações</dt><dd style={{ whiteSpace: "pre-wrap" }}>{ch.expansionsInfo}</dd>
                <dt>Reformas</dt><dd style={{ whiteSpace: "pre-wrap" }}>{ch.renovationsInfo}</dd>
                <dt>Observações técnicas</dt><dd style={{ whiteSpace: "pre-wrap" }}>{ch.technicalNotes}</dd>
              </dl>)}
          </section>
        </div>
        <section className="panel" aria-labelledby="resp"><h2 id="resp">Responsáveis atuais</h2>
          {data.responsibles.length === 0 ? <p className="muted">Nenhum responsável vigente. <Link href={`/empreendimentos/${project.id}/responsaveis`}>Gerenciar</Link></p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{data.responsibles.map((r) => (
              <li key={r.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--rule-2)" }}>
                <b>{r.responsible.name}</b><div className="sub muted">{r.role === "OTHER" && r.roleDetail ? r.roleDetail : responsibleRoleLabels[r.role]}{r.responsible.companyName ? ` · ${r.responsible.companyName}` : ""}</div>
                <div className="sub muted">desde {formatDate(r.startDate)}</div>
              </li>))}</ul>)}
          <p style={{ marginTop: 12 }}><Link href={`/empreendimentos/${project.id}/responsaveis`}>Ver todos os vínculos</Link></p>
        </section>
      </div>
    </>
  );
}

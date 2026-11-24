"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { use } from "react";
import { ProjectCtx, type ProjectInfo } from "@/components/ProjectContext";
import { ErrorBox, Loading, StatusBadge, useFetch } from "@/ui/kit";

export default function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const path = usePathname();
  const { data, error, loading, reload } = useFetch<ProjectInfo>(`/api/projects/${id}`);
  const base = `/empreendimentos/${id}`;
  if (path.endsWith("/editar")) {
    return (
      <>
        <nav className="crumbs" aria-label="Você está em"><Link href="/empreendimentos">Empreendimentos</Link> / <Link href={base}>{data?.name ?? "…"}</Link> / <span>Editar</span></nav>
        {error ? <ErrorBox error={error} onRetry={reload} /> : !data ? <Loading /> : <ProjectCtx.Provider value={{ project: data, reload }}>{children}</ProjectCtx.Provider>}
      </>
    );
  }
  const tabs = [[base, "Visão geral"], [`${base}/estrutura`, "Estrutura física"], [`${base}/responsaveis`, "Responsáveis"], [`${base}/historico`, "Histórico"]];
  return (
    <>
      <nav className="crumbs" aria-label="Você está em"><Link href="/empreendimentos">Empreendimentos</Link> / <span>{data?.name ?? "…"}</span></nav>
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : data && (
        <ProjectCtx.Provider value={{ project: data, reload }}>
          <div className="pagehead">
            <div>
              <h1>{data.name}</h1>
              <div className="meta"><span className="mono">{data.code}</span><StatusBadge status={data.status} /><span>Cliente: <Link href={`/clientes/${data.client.id}`}>{data.client.name}</Link></span></div>
            </div>
          </div>
          {data.status === "INACTIVE" && <div className="alert alert-warn" style={{ marginBottom: 16 }}>Empreendimento inativo: somente consulta. Reative-o na lista de empreendimentos para voltar a editar.</div>}
          <nav className="tabs" aria-label="Seções do empreendimento">
            {tabs.map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>{label}</Link>)}
          </nav>
          {children}
        </ProjectCtx.Provider>
      )}
    </>
  );
}

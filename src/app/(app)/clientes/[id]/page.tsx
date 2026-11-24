"use client";
import Link from "next/link";
import { use } from "react";
import { ClientForm, type ClientData } from "@/components/ClientForm";
import { ErrorBox, Loading, StatusBadge, useFetch } from "@/ui/kit";
import { projectTypeLabels } from "@/lib/labels";

type Detail = ClientData & { name: string; status: "ACTIVE" | "INACTIVE"; projects: { id: string; code: string; name: string; projectType: keyof typeof projectTypeLabels; status: "ACTIVE" | "INACTIVE"; city: string | null; state: string | null }[] };

export default function EditClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = useFetch<Detail>(`/api/clients/${id}`);
  return (
    <>
      <nav className="crumbs" aria-label="Você está em"><Link href="/clientes">Clientes</Link> / <span>{data?.name ?? "…"}</span></nav>
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading || !data ? <Loading /> : (
        <>
          <div className="pagehead"><div><h1>{data.name}</h1><div className="meta"><StatusBadge status={data.status} /></div></div></div>
          <ClientForm initial={data} />
          <section className="formsec" style={{ marginTop: 28 }} aria-labelledby="ep">
            <h2 id="ep" style={{ marginBottom: 12 }}>Empreendimentos deste cliente</h2>
            {data.projects.length === 0 ? <p className="muted">Nenhum empreendimento vinculado.</p> : (
              <div className="tablewrap"><table className="t"><tbody>
                {data.projects.map((p) => (
                  <tr key={p.id}><td className="mono">{p.code}</td><td><Link href={`/empreendimentos/${p.id}`}>{p.name}</Link></td><td>{projectTypeLabels[p.projectType]}</td><td>{p.city}{p.state ? `/${p.state}` : ""}</td><td><StatusBadge status={p.status} /></td></tr>
                ))}
              </tbody></table></div>
            )}
          </section>
        </>
      )}
    </>
  );
}

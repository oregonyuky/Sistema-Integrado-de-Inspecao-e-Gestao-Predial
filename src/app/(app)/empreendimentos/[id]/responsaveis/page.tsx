"use client";
import { useState } from "react";
import { useProject } from "@/components/ProjectContext";
import { AssignmentModal, EndAssignmentModal, type Assign } from "@/components/ResponsibleModals";
import { Empty, ErrorBox, Loading, SelectField, useCan, useFetch } from "@/ui/kit";
import { responsibleRoleLabels } from "@/lib/labels";
import { formatDate, formatPhone } from "@/lib/format";

export default function ResponsiblesTab() {
  const { project } = useProject(); const can = useCan();
  const editable = can.write && project.status === "ACTIVE";
  const [filter, setFilter] = useState("true");
  const { data, error, loading, reload } = useFetch<Assign[]>(`/api/projects/${project.id}/assignments${filter ? `?current=${filter}` : ""}`);
  const [form, setForm] = useState<Assign | null | undefined>(undefined);
  const [ending, setEnding] = useState<Assign | undefined>(undefined);

  return (
    <>
      <div className="toolbar">
        <SelectField label="Mostrar" name="f" value={filter} onChange={setFilter} options={[["true", "Vigentes"], ["false", "Encerrados / futuros"], ["", "Todos"]]} />
        {editable && <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setForm(null)}>Vincular responsável</button>}
      </div>
      {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? <Loading /> : !data?.length ? (
        <Empty title={filter === "true" ? "Nenhum responsável vigente" : "Nenhum vínculo encontrado"} action={editable && filter === "true" ? <button className="btn btn-primary" onClick={() => setForm(null)}>Vincular responsável</button> : undefined}>
          Síndico, administradora, zelador e demais responsáveis aparecem aqui, com o período de cada função.
        </Empty>
      ) : (
        <div className="tablewrap" style={{ opacity: loading ? 0.6 : 1 }}><table className="t stack">
          <thead><tr><th>Responsável</th><th>Função</th><th>Período</th><th>Contato</th><th><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{data.map((a) => (
            <tr key={a.id}>
              <td className="first"><span className="name">{a.responsible.name}</span><div className="sub">{a.responsible.companyName}{a.responsible.professionalRegistration ? ` · ${a.responsible.professionalRegistration}` : ""}</div></td>
              <td data-label="Função">{a.role === "OTHER" && a.roleDetail ? a.roleDetail : responsibleRoleLabels[a.role]}{a.role !== "OTHER" && a.roleDetail ? <div className="sub">{a.roleDetail}</div> : null}</td>
              <td data-label="Período">{formatDate(a.startDate)} → {a.endDate ? formatDate(a.endDate) : "em vigor"} {a.current ? <span className="badge badge-ok">Vigente</span> : <span className="badge badge-off">{a.startDate > new Date().toISOString().slice(0, 10) ? "Futuro" : "Encerrado"}</span>}</td>
              <td data-label="Contato">{a.responsible.email || a.responsible.phone ? <>{a.responsible.email}<div className="sub">{a.responsible.masked ? a.responsible.phone : formatPhone(a.responsible.phone)}</div></> : <span className="none">—</span>}</td>
              <td className="acts"><div className="rowact">
                {editable && <button className="btn btn-quiet btn-sm" onClick={() => setForm(a)}>Editar</button>}
                {editable && a.current && !a.endDate && <button className="btn btn-quiet btn-sm" onClick={() => setEnding(a)}>Desvincular</button>}
              </div></td>
            </tr>))}</tbody>
        </table></div>
      )}
      <AssignmentModal projectId={project.id} state={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); reload(); }} />
      <EndAssignmentModal a={ending} onClose={() => setEnding(undefined)} onDone={() => { setEnding(undefined); reload(); }} />
    </>
  );
}

"use client";
import { ProjectForm, type ProjectData } from "@/components/ProjectForm";
import { useProject } from "@/components/ProjectContext";
import { useCan } from "@/ui/kit";

export default function EditProject() {
  const { project } = useProject();
  const can = useCan();
  return (
    <>
      <div className="pagehead"><h1>Editar empreendimento</h1></div>
      {project.status === "INACTIVE" && <div className="alert alert-warn" style={{ marginBottom: 16 }}>Empreendimento inativo: reative-o para editar.</div>}
      <ProjectForm initial={project as unknown as ProjectData} readOnly={!can.write || project.status === "INACTIVE"} />
    </>
  );
}

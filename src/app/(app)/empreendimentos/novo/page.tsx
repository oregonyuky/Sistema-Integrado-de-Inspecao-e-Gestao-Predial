"use client";
import Link from "next/link";
import { ProjectForm } from "@/components/ProjectForm";
import { useCan } from "@/ui/kit";

export default function NewProject() {
  const can = useCan();
  return (
    <>
      <nav className="crumbs" aria-label="Você está em"><Link href="/empreendimentos">Empreendimentos</Link> / <span>Novo</span></nav>
      <div className="pagehead"><h1>Novo empreendimento</h1></div>
      {can.write ? <ProjectForm /> : <div className="alert alert-warn">Seu perfil não permite cadastrar empreendimentos.</div>}
    </>
  );
}

"use client";
import Link from "next/link";
import { ClientForm } from "@/components/ClientForm";
import { useCan } from "@/ui/kit";

export default function NewClient() {
  const can = useCan();
  return (
    <>
      <nav className="crumbs" aria-label="Você está em"><Link href="/clientes">Clientes</Link> / <span>Novo</span></nav>
      <div className="pagehead"><h1>Novo cliente</h1></div>
      {can.write ? <ClientForm /> : <div className="alert alert-warn">Seu perfil não permite cadastrar clientes.</div>}
    </>
  );
}

"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/ui/api";
import { Loading, SessionCtx, UIProvider, type SessionUser } from "@/ui/kit";
import { roleLabels } from "@/lib/labels";

const NAV = [
  { href: "/empreendimentos", label: "Empreendimentos" },
  { href: "/clientes", label: "Clientes" },
  { href: "/catalogo", label: "Catálogo técnico" },
  { href: "/normas", label: "Normas" },
  { href: "/manifestacoes", label: "Manifestações" },
  { href: "/responsaveis", label: "Responsáveis" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    api<{ user: SessionUser }>("/api/auth/me").then((r) => setUser(r.user)).catch(() => {});
  }, []);
  useEffect(() => setOpen(false), [path]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
  }

  if (!user) return <div style={{ padding: 40 }}><Loading text="Verificando sessão…" /></div>;
  return (
    <SessionCtx.Provider value={user}>
      <UIProvider>
        <a className="skip" href="#conteudo">Ir para o conteúdo</a>
        <div className="shell">
          <header className="rail" data-open={open}>
            <div className="brand">SIIGP<small>{user.organization}</small></div>
            <button className="btn btn-sm menu-btn" aria-expanded={open} aria-controls="nav" onClick={() => setOpen(!open)}>Menu</button>
            <nav id="nav" aria-label="Principal">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="navlink" aria-current={path.startsWith(n.href) ? "page" : undefined}>{n.label}</Link>
              ))}
            </nav>
            <div className="who">
              <b>{user.name}</b><span>{roleLabels[user.role]}</span>
              <button className="btn btn-sm" onClick={logout}>Sair</button>
            </div>
          </header>
          <main id="conteudo" tabIndex={-1}>{children}</main>
        </div>
      </UIProvider>
    </SessionCtx.Provider>
  );
}

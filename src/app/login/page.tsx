"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/ui/api";
import { TextField } from "@/ui/kit";

function LoginForm() {
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [fe, setFe] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const f: Record<string, string> = {};
    if (!email.trim()) f.email = "Campo obrigatório."; 
    if (!password) f.password = "Campo obrigatório.";
    setFe(f);
    if (Object.keys(f).length) return;
    setBusy(true); setErr("");
    try {
      await api("/api/auth/login", { body: { email, password } });
      const next = sp.get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/empreendimentos";
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Não foi possível entrar.");
      if (x instanceof ApiError) setFe(x.fields);
      setBusy(false);
    }
  }

  return (
    <div className="loginwrap">
      <aside className="loginart">
        <div><h1>SIIGP</h1><p style={{ marginTop: 8 }}>Sistema Inteligente de Gestão Predial</p></div>
        <p>Cadastro e gestão de empreendimentos: clientes, estrutura física, responsáveis e histórico em um só lugar.</p>
      </aside>
      <main className="loginform" id="conteudo">
        <form onSubmit={submit} noValidate>
          <h2 style={{ fontSize: "1.4rem" }}>Entrar</h2>
          {err && <div className="alert alert-bad" role="alert">{err}</div>}
          <TextField label="E-mail" name="email" type="email" value={email} onChange={setEmail} required error={fe.email} autoComplete="username" autoFocus />
          <TextField label="Senha" name="password" type="password" value={password} onChange={setPassword} required error={fe.password} autoComplete="current-password" />
          <button className="btn btn-primary" disabled={busy} style={{ justifyContent: "center" }}>{busy ? <><span className="spin" /> Entrando…</> : "Entrar"}</button>
        </form>
      </main>
    </div>
  );
}
export default function Page() { return <Suspense><LoginForm /></Suspense>; }

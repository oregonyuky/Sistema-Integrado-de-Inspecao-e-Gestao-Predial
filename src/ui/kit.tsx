"use client";
import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { api, ApiError } from "./api";

/* ───────── sessão ───────── */
export type SessionUser = { id: string; name: string; email: string; role: "ADMIN" | "EDITOR" | "VIEWER"; organization: string };
export const SessionCtx = createContext<SessionUser | null>(null);
export const useSession = () => useContext(SessionCtx)!;
export const useCan = () => {
  const u = useSession();
  return { write: u.role !== "VIEWER", admin: u.role === "ADMIN" };
};

/* ───────── toasts ───────── */
type Toast = { id: number; kind: "ok" | "bad" | "info"; text: string };
const ToastCtx = createContext<{ ok: (t: string) => void; bad: (t: string) => void }>({ ok() {}, bad() {} });
export const useToast = () => useContext(ToastCtx);

/* ───────── confirmação ───────── */
type ConfirmOpts = { title: string; message?: React.ReactNode; confirmLabel?: string; danger?: boolean; reasonLabel?: string };
type ConfirmFn = (o: ConfirmOpts) => Promise<{ ok: boolean; reason: string }>;
const ConfirmCtx = createContext<ConfirmFn>(async () => ({ ok: false, reason: "" }));
export const useConfirm = () => useContext(ConfirmCtx);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "bad" ? 7000 : 4000);
  }, []);
  const toastApi = useRef({ ok: (t: string) => push("ok", t), bad: (t: string) => push("bad", t) }).current;

  const [conf, setConf] = useState<{ o: ConfirmOpts; res: (v: { ok: boolean; reason: string }) => void } | null>(null);
  const [reason, setReason] = useState("");
  const confirm = useCallback<ConfirmFn>((o) => new Promise((res) => { setReason(""); setConf({ o, res }); }), []);
  const close = (ok: boolean) => {
    if (!conf) return;
    if (ok && conf.o.reasonLabel && !reason.trim()) return;
    conf.res({ ok, reason: reason.trim() });
    setConf(null);
  };

  return (
    <ToastCtx.Provider value={toastApi}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
        </div>
        <Modal open={!!conf} onClose={() => close(false)} title={conf?.o.title ?? ""}
          footer={<>
            <button className="btn" onClick={() => close(false)}>Cancelar</button>
            <button className={`btn ${conf?.o.danger ? "btn-danger-solid" : "btn-primary"}`} onClick={() => close(true)} disabled={!!conf?.o.reasonLabel && !reason.trim()}>
              {conf?.o.confirmLabel ?? "Confirmar"}
            </button>
          </>}>
          {conf?.o.message && <div style={{ marginBottom: conf.o.reasonLabel ? 14 : 0 }}>{conf.o.message}</div>}
          {conf?.o.reasonLabel && (
            <TextArea label={conf.o.reasonLabel} required value={reason} onChange={setReason} name="reason" maxLength={500} />
          )}
        </Modal>
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}

/* ───────── modal (dialog nativo: foco preso, ESC fecha) ───────── */
export function Modal({ open, onClose, title, children, footer, wide, onSubmit }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; onSubmit?: (e: React.FormEvent) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const tid = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  if (!open) return <dialog ref={ref} className="modal" />;
  const Body = onSubmit ? "form" : "div";
  return (
    <dialog ref={ref} className={`modal${wide ? " wide" : ""}`} aria-labelledby={tid}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <Body className="mbody" {...(onSubmit ? { onSubmit, noValidate: true } : {})}>
        <div className="mhead">
          <h2 id={tid}>{title}</h2>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="mbody-in">{children}</div>
        {footer && <div className="mfoot">{footer}</div>}
      </Body>
    </dialog>
  );
}

/* ───────── campos ───────── */
type Base = { label: string; name: string; required?: boolean; error?: string; hint?: string; className?: string };
const Wrap = ({ id, label, required, error, hint, className, children }: Base & { id: string; children: React.ReactNode }) => (
  <div className={`field ${className ?? ""}`}>
    <label htmlFor={id}>{label}{required && <span className="req" aria-hidden="true"> *</span>}{required && <span className="sr-only"> (obrigatório)</span>}</label>
    {children}
    {hint && !error && <span id={`${id}-h`} className="hint">{hint}</span>}
    {error && <span id={`${id}-e`} className="err" role="alert">{error}</span>}
  </div>
);
const aria = (id: string, error?: string, hint?: string) => ({
  "aria-invalid": error ? true : undefined,
  "aria-describedby": error ? `${id}-e` : hint ? `${id}-h` : undefined,
});

export function TextField(p: Base & { value: string; onChange: (v: string) => void; type?: string; placeholder?: string; maxLength?: number; disabled?: boolean; inputMode?: "numeric" | "decimal" | "tel" | "email" | "text"; autoComplete?: string; autoFocus?: boolean }) {
  const id = useId();
  return (
    <Wrap id={id} {...p}>
      <input id={id} name={p.name} className="input" type={p.type ?? "text"} value={p.value} placeholder={p.placeholder} maxLength={p.maxLength}
        disabled={p.disabled} inputMode={p.inputMode} autoComplete={p.autoComplete ?? "off"} autoFocus={p.autoFocus}
        onChange={(e) => p.onChange(e.target.value)} {...aria(id, p.error, p.hint)} />
    </Wrap>
  );
}
export function TextArea(p: Base & { value: string; onChange: (v: string) => void; maxLength?: number }) {
  const id = useId();
  return (
    <Wrap id={id} {...p}>
      <textarea id={id} name={p.name} className="textarea" value={p.value} maxLength={p.maxLength} onChange={(e) => p.onChange(e.target.value)} {...aria(id, p.error, p.hint)} />
    </Wrap>
  );
}
export function SelectField(p: Base & { value: string; onChange: (v: string) => void; options: [string, string][]; placeholder?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <Wrap id={id} {...p}>
      <select id={id} name={p.name} className="select" value={p.value} disabled={p.disabled} onChange={(e) => p.onChange(e.target.value)} {...aria(id, p.error, p.hint)}>
        {p.placeholder !== undefined && <option value="">{p.placeholder}</option>}
        {p.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Wrap>
  );
}
export const opts = (m: Record<string, string>): [string, string][] => Object.entries(m);

/* ───────── pequenos componentes ───────── */
export const StatusBadge = ({ status }: { status: "ACTIVE" | "INACTIVE" }) => (
  <span className={`badge ${status === "ACTIVE" ? "badge-ok" : "badge-off"}`}>{status === "ACTIVE" ? "Ativo" : "Inativo"}</span>
);
export const Loading = ({ text = "Carregando…" }: { text?: string }) => (
  <div className="loading" role="status"><span className="spin" aria-hidden="true" />{text}</div>
);
export const ErrorBox = ({ error, onRetry }: { error: Error; onRetry?: () => void }) => (
  <div className="alert alert-bad" role="alert">
    {error.message} {onRetry && <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={onRetry}>Tentar novamente</button>}
  </div>
);
export const Empty = ({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) => (
  <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}{action && <div className="actions">{action}</div>}</div>
);

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <div className="pager"><span>{total} {total === 1 ? "registro" : "registros"}</span></div>;
  const from = (page - 1) * pageSize + 1;
  return (
    <nav className="pager" aria-label="Paginação">
      <span>{from}–{Math.min(page * pageSize, total)} de {total}</span>
      <span className="actions">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
        <span>Página {page} de {pages}</span>
        <button className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Próxima</button>
      </span>
    </nav>
  );
}

/* ───────── hooks ───────── */
export function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export function useFetch<T>(url: string | null) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: !!url });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    const ac = new AbortController();
    setState((s) => ({ ...s, loading: true, error: undefined }));
    api<T>(url, { signal: ac.signal })
      .then((data) => setState({ data, loading: false }))
      .catch((error) => { if ((error as Error).name !== "AbortError") setState((s) => ({ data: s.data, error, loading: false })); });
    return () => ac.abort();
  }, [url, tick]);
  return { ...state, reload: useCallback(() => setTick((t) => t + 1), []) };
}

/** Executa ação com tratamento de erro → toast. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) toast.ok(okMsg);
      return r;
    } catch (e) {
      toast.bad(e instanceof ApiError ? e.message : "Não foi possível concluir a operação.");
    } finally { setBusy(false); }
  }, [toast]);
  return { busy, run };
}

export const fieldErrors = (e: unknown): Record<string, string> => (e instanceof ApiError ? e.fields : {});

/** Útil para o ícone do shell/árvore. */
export const Chevron = () => (<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>);

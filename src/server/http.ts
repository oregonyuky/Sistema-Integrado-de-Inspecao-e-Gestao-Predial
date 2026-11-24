import { NextRequest, NextResponse } from "next/server";
import { AppError, invalid, toAppError } from "./errors";
import { requireContext } from "./auth/session";

type Authed = Awaited<ReturnType<typeof requireContext>>;

export function errorResponse(e: unknown) {
  const err = toAppError(e);
  return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
}

/** Bloqueia requisições de escrita originadas de outro site (CSRF), além de SameSite=Lax. */
export function checkOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let oh: string;
  try {
    oh = new URL(origin).host;
  } catch {
    throw new AppError(403, "FORBIDDEN", "Origem inválida.");
  }
  if (oh !== host) throw new AppError(403, "FORBIDDEN", "Origem não permitida.");
}

type Params = Record<string, string>;

export function route<P extends Params = Params>(
  fn: (req: NextRequest, ctx: Authed, params: P) => Promise<unknown>,
  opts: { status?: number } = {},
) {
  return async (req: NextRequest, rc: { params: Promise<P> }) => {
    try {
      checkOrigin(req);
      const ctx = await requireContext();
      const params = await rc.params;
      const result = await fn(req, ctx, params);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { status: opts.status ?? 200, headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function body(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw invalid("Corpo da requisição inválido.");
  }
}

export const query = (req: NextRequest): Record<string, string> => Object.fromEntries(req.nextUrl.searchParams);

/** Corpo opcional: ausente ou inválido vira objeto vazio. */
export async function optBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

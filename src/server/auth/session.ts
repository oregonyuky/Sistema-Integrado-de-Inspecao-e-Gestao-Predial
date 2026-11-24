import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "../db";
import type { Ctx } from "../context";
import { unauthorized } from "../errors";

export const COOKIE = "siigp_session";
const MAX_AGE = 60 * 60 * 8; // 8 h

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET ausente ou com menos de 32 caracteres");
  return new TextEncoder().encode(s);
}

export async function signSession(userId: string) {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secret());
}

export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
});

/** Resolve o contexto a partir do cookie, revalidando usuário e organização no banco a cada requisição. */
export async function getContext(): Promise<(Ctx & { name: string; email: string; organizationName: string }) | null> {
  const store = await cookies();
  const userId = await verifySession(store.get(COOKIE)?.value);
  if (!userId) return null;
  const u = await db.user.findUnique({ where: { id: userId }, include: { organization: true } });
  if (!u || u.status !== "ACTIVE" || u.organization.status !== "ACTIVE") return null;
  return { organizationId: u.organizationId, userId: u.id, role: u.role, name: u.name, email: u.email, organizationName: u.organization.name };
}

export async function requireContext() {
  const c = await getContext();
  if (!c) throw unauthorized();
  return c;
}

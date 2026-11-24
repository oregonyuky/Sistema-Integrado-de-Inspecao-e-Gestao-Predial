import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { loginSchema } from "@/server/validation";
import { checkOrigin, errorResponse } from "@/server/http";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { clearFailures, registerFailure, tooManyAttempts } from "@/server/auth/rate-limit";
import { COOKIE, cookieOptions, signSession } from "@/server/auth/session";

let dummyHash: Promise<string> | null = null;

export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const raw = await req.json().catch(() => ({}));
    const { email, password } = loginSchema.parse(raw);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const key = `${ip}|${email}`;
    if (tooManyAttempts(key)) throw new AppError(429, "RATE_LIMITED", "Muitas tentativas. Aguarde alguns minutos e tente novamente.");

    const user = await db.user.findUnique({ where: { email }, include: { organization: true } });
    // Mesma quantidade de trabalho com ou sem usuário, para não revelar quais e-mails existem.
    dummyHash ??= hashPassword("senha-inexistente-para-igualar-tempo");
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok || user.status !== "ACTIVE" || user.organization.status !== "ACTIVE") {
      registerFailure(key);
      throw new AppError(401, "INVALID_CREDENTIALS", "E-mail ou senha incorretos.");
    }
    clearFailures(key);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, organization: user.organization.name } });
    res.cookies.set(COOKIE, await signSession(user.id), cookieOptions());
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}

import { NextResponse } from "next/server";
import { getContext } from "@/server/auth/session";

export async function GET() {
  const c = await getContext();
  if (!c) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sessão inválida ou expirada. Entre novamente." } }, { status: 401 });
  return NextResponse.json(
    { user: { id: c.userId, name: c.name, email: c.email, role: c.role, organization: c.organizationName } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

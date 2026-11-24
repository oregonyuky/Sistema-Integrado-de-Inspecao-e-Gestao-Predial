import { NextRequest, NextResponse } from "next/server";
import { COOKIE } from "@/server/auth/session";
import { checkOrigin, errorResponse } from "@/server/http";

export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}

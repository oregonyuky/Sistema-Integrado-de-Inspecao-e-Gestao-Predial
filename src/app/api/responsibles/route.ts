import { route, body, optBody, query } from "@/server/http";
import { createResponsible, listResponsibles } from "@/server/services/responsibles";

export const GET = route(async (req, ctx) => listResponsibles(ctx, query(req)));
export const POST = route(async (req, ctx) => createResponsible(ctx, await body(req)), { status: 201 });

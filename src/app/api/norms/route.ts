import { route, body, optBody, query } from "@/server/http";
import { listNorms, createNorm } from "@/server/services/norms";

export const GET = route(async (req, ctx) => listNorms(ctx, query(req)));
export const POST = route(async (req, ctx) => createNorm(ctx, await body(req)), { status: 201 });

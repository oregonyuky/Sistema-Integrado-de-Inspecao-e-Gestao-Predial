import { route, body, optBody, query } from "@/server/http";
import { listClassifications, createClassification } from "@/server/services/manifestations";

export const GET = route(async (req, ctx) => listClassifications(ctx, query(req)));
export const POST = route(async (req, ctx) => createClassification(ctx, await body(req)), { status: 201 });

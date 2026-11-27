import { route, body, optBody, query } from "@/server/http";
import { listCriteria, createCriterion } from "@/server/services/criteria";

export const GET = route<{ id: string }>(async (req, ctx, { id }) => listCriteria(ctx, id, query(req)));
export const POST = route<{ id: string }>(async (req, ctx, { id }) => createCriterion(ctx, id, await body(req)), { status: 201 });

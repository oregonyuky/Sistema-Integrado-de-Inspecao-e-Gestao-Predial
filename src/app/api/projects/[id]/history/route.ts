import { route, body, optBody, query } from "@/server/http";
import { createHistory, listHistory } from "@/server/services/history";

export const GET = route<{ id: string }>(async (req, ctx, { id }) => listHistory(ctx, id, query(req)));
export const POST = route<{ id: string }>(async (req, ctx, { id }) => createHistory(ctx, id, await body(req)), { status: 201 });

import { route, body, optBody, query } from "@/server/http";
import { getClient, updateClient } from "@/server/services/clients";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => getClient(ctx, id));
export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateClient(ctx, id, await body(req)));

import { route, body, optBody, query } from "@/server/http";
import { getHistoryEntry, updateHistory } from "@/server/services/history";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => getHistoryEntry(ctx, id));
export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateHistory(ctx, id, await body(req)));

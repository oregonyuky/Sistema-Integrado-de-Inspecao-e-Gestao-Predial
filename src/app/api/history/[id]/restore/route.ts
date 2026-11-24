import { route, body, optBody, query } from "@/server/http";
import { restoreHistory } from "@/server/services/history";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => restoreHistory(ctx, id));

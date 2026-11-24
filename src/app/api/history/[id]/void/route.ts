import { route, body, optBody, query } from "@/server/http";
import { voidHistory } from "@/server/services/history";

export const POST = route<{ id: string }>(async (req, ctx, { id }) => voidHistory(ctx, id, await body(req)));

import { route, body, optBody, query } from "@/server/http";
import { componentHistory } from "@/server/services/components";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => componentHistory(ctx, id));

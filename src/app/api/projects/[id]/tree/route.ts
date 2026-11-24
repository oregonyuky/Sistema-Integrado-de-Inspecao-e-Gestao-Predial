import { route, body, optBody, query } from "@/server/http";
import { getTree } from "@/server/services/locations";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => getTree(ctx, id));

import { route, body, optBody, query } from "@/server/http";
import { getComponent, updateComponent } from "@/server/services/components";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => getComponent(ctx, id));
export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateComponent(ctx, id, await body(req)));

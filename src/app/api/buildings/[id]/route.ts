import { route, body, optBody, query } from "@/server/http";
import { deleteBuilding, getBuilding, updateBuilding } from "@/server/services/buildings";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => getBuilding(ctx, id));
export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateBuilding(ctx, id, await body(req)));
export const DELETE = route<{ id: string }>(async (_req, ctx, { id }) => deleteBuilding(ctx, id));

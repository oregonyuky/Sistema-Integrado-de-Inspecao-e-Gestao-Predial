import { route, body, optBody, query } from "@/server/http";
import { deleteLocation, getLocation, updateLocation } from "@/server/services/locations";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => getLocation(ctx, id));
export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateLocation(ctx, id, await body(req)));
export const DELETE = route<{ id: string }>(async (_req, ctx, { id }) => deleteLocation(ctx, id));

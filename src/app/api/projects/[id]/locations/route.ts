import { route, body, optBody, query } from "@/server/http";
import { createLocation, searchLocations } from "@/server/services/locations";

export const GET = route<{ id: string }>(async (req, ctx, { id }) => searchLocations(ctx, id, query(req)));
export const POST = route<{ id: string }>(async (req, ctx, { id }) => createLocation(ctx, id, await body(req)), { status: 201 });

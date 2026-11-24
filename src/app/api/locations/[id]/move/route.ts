import { route, body, optBody, query } from "@/server/http";
import { moveLocation } from "@/server/services/locations";

export const POST = route<{ id: string }>(async (req, ctx, { id }) => moveLocation(ctx, id, await body(req)));

import { route, body, optBody, query } from "@/server/http";
import { reorderLocation } from "@/server/services/locations";

export const POST = route<{ id: string }>(async (req, ctx, { id }) => reorderLocation(ctx, id, await body(req)));

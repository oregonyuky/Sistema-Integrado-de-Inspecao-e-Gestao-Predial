import { route, body, optBody, query } from "@/server/http";
import { deactivateLocation } from "@/server/services/locations";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => deactivateLocation(ctx, id));

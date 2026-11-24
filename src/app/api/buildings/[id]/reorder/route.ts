import { route, body, optBody, query } from "@/server/http";
import { reorderBuilding } from "@/server/services/buildings";

export const POST = route<{ id: string }>(async (req, ctx, { id }) => reorderBuilding(ctx, id, await body(req)));

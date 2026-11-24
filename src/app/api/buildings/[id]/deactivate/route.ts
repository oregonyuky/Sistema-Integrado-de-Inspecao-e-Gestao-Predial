import { route, body, optBody, query } from "@/server/http";
import { deactivateBuilding } from "@/server/services/buildings";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => deactivateBuilding(ctx, id));

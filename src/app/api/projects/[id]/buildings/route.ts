import { route, body, optBody, query } from "@/server/http";
import { createBuilding, listBuildings } from "@/server/services/buildings";

export const GET = route<{ id: string }>(async (req, ctx, { id }) => listBuildings(ctx, id, query(req)));
export const POST = route<{ id: string }>(async (req, ctx, { id }) => createBuilding(ctx, id, await body(req)), { status: 201 });

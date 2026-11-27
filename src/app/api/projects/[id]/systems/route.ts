import { route, body, optBody, query } from "@/server/http";
import { listProjectSystems, selectProjectSystem } from "@/server/services/project-systems";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => listProjectSystems(ctx, id));
export const POST = route<{ id: string }>(async (req, ctx, { id }) => selectProjectSystem(ctx, id, await body(req)), { status: 201 });

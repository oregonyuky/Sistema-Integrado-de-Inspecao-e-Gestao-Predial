import { route, body, optBody, query } from "@/server/http";
import { getProject, updateProject } from "@/server/services/projects";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => getProject(ctx, id));
export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateProject(ctx, id, await body(req)));

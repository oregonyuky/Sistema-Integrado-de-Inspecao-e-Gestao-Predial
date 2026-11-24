import { route, body, optBody, query } from "@/server/http";
import { deactivateProject } from "@/server/services/projects";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => deactivateProject(ctx, id));

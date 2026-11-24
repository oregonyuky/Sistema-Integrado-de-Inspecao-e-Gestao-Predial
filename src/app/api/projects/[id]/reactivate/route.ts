import { route, body, optBody, query } from "@/server/http";
import { reactivateProject } from "@/server/services/projects";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => reactivateProject(ctx, id));

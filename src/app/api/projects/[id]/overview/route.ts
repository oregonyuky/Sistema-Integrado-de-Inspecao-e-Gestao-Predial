import { route, body, optBody, query } from "@/server/http";
import { getProjectOverview } from "@/server/services/projects";

export const GET = route<{ id: string }>(async (_req, ctx, { id }) => getProjectOverview(ctx, id));

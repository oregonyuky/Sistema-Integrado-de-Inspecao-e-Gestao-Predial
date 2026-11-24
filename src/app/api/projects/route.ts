import { route, body, optBody, query } from "@/server/http";
import { createProject, listProjects } from "@/server/services/projects";

export const GET = route(async (req, ctx) => listProjects(ctx, query(req)));
export const POST = route(async (req, ctx) => createProject(ctx, await body(req)), { status: 201 });

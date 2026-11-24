import { route, body, optBody, query } from "@/server/http";
import { createClient, listClients } from "@/server/services/clients";

export const GET = route(async (req, ctx) => listClients(ctx, query(req)));
export const POST = route(async (req, ctx) => createClient(ctx, await body(req)), { status: 201 });

import { route, body, optBody, query } from "@/server/http";
import { listManifestations, createManifestation } from "@/server/services/manifestations";

export const GET = route(async (req, ctx) => listManifestations(ctx, query(req)));
export const POST = route(async (req, ctx) => createManifestation(ctx, await body(req)), { status: 201 });

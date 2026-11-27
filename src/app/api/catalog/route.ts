import { route, body, optBody, query } from "@/server/http";
import { listCatalog, createCatalogItem } from "@/server/services/catalog";

export const GET = route(async (req, ctx) => listCatalog(ctx, query(req)));
export const POST = route(async (req, ctx) => createCatalogItem(ctx, await body(req)), { status: 201 });

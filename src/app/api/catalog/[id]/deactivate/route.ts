import { route, body, optBody, query } from "@/server/http";
import { deactivateCatalogItem } from "@/server/services/catalog";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => deactivateCatalogItem(ctx, id));

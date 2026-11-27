import { route, body, optBody, query } from "@/server/http";
import { removeCatalogNormLink } from "@/server/services/norms";

export const DELETE = route<{ id: string }>(async (_req, ctx, { id }) => removeCatalogNormLink(ctx, id));

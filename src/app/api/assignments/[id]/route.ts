import { route, body, optBody, query } from "@/server/http";
import { updateAssignment } from "@/server/services/responsibles";

export const PUT = route<{ id: string }>(async (req, ctx, { id }) => updateAssignment(ctx, id, await body(req)));

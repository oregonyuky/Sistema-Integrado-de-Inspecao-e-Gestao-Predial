import { route, body, optBody, query } from "@/server/http";
import { setResponsibleStatus } from "@/server/services/responsibles";
import { invalid } from "@/server/errors";

export const POST = route<{ id: string }>(async (req, ctx, { id }) => {
  const b = await body(req);
  const status = (b as { status?: string }).status;
  if (status !== "ACTIVE" && status !== "INACTIVE") throw invalid("Situação inválida.");
  return setResponsibleStatus(ctx, id, status);
});

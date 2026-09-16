import { requireSession, requireTenantScope } from "@/core/auth/session";
import { errorResponse } from "@/core/auth/errors";
import { parseInput } from "@/core/validation/parse-input";
import { assertMinimarketAccess } from "@/modules/minimarket/server/access";
import { quoteRetail, quoteSchema } from "@/modules/minimarket/server/promotions";
export async function POST(request: Request) {
  try { assertMinimarketAccess(await requireSession(), "pos"); const input = parseInput(quoteSchema, await request.json()); return Response.json(await quoteRetail(await requireTenantScope(), input), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error); }
}

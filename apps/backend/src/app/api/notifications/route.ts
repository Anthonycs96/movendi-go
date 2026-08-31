import { errorResponse } from "@/core/auth/errors";
import { requireSession } from "@/core/auth/session";
import { getOperationalNotifications } from "@/core/notifications/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const items = await getOperationalNotifications(session);
    return Response.json({ items, total: items.length, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

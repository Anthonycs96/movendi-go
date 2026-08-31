import { errorResponse } from "@/core/auth/errors";
import { createPublicCheckout } from "@/core/billing/checkout";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const checkout = await createPublicCheckout(body, request);
    return Response.json({ checkout, message: "Contratación creada. Continúa en el proveedor de pago." }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

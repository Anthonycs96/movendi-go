import { AppError, errorResponse } from "@/core/auth/errors";
import { requireSession, requireTenantScope } from "@/core/auth/session";
import { prisma } from "@/core/database/prisma";
import { assertMinimarketAccess } from "@/modules/minimarket/server/access";
import { importTemplate, parseImportFile, validateImport } from "@/modules/minimarket/server/import";

async function access() { assertMinimarketAccess(await requireSession(), "catalog", "minimarket:catalog:write"); return requireTenantScope("minimarket:catalog:write"); }
export async function GET(request: Request) {
  try {
    await access(); const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
    const buffer = await importTemplate(format);
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": format === "csv" ? "text/csv;charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="minimarket-productos.${format}"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const scope = await access();
    if (Number(request.headers.get("content-length") ?? 0) > 2_200_000) throw new AppError("FILE_TOO_LARGE", 413, "El archivo debe pesar menos de 2 MB.");
    const form = await request.formData(), file = form.get("file");
    if (!(file instanceof File)) throw new AppError("FILE_REQUIRED", 400, "Selecciona el archivo.");
    if (file.size > 2 * 1024 * 1024) throw new AppError("FILE_TOO_LARGE", 413, "El archivo debe pesar menos de 2 MB.");
    const parsed = await parseImportFile(Buffer.from(await file.arrayBuffer()), file.name);
    const validation = parsed.issues.length ? { issues: [] } : await validateImport(prisma, scope, parsed.rows);
    return Response.json({ rows: parsed.rows, issues: [...parsed.issues, ...validation.issues] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

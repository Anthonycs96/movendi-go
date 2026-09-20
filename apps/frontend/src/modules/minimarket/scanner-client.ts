export type ScannerEvent = { sequence: number; barcode: string; cartIntentId: string };
export type ScannerState = { connectionId: string; registerName: string; cashierName: string; branchName: string; tenantName: string; accepting: boolean; paired: boolean; phoneOnline: boolean; pairExpiresAt: string; events?: ScannerEvent[]; event?: { status: string; message: string | null } | null };
export class ScannerError extends Error { constructor(message: string, public readonly status: number, public readonly code: string) { super(message); } }
export const scannerSecret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, "0")).join("");
export async function scannerRequest(body: Record<string, unknown>, context?: string): Promise<ScannerState> {
  let response: Response;
  try { response = await fetch("/api/minimarket/scanner", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", ...(context ? { "X-Retail-Context": context } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) }); }
  catch { throw new Error("No se pudo confirmar la conexión con la caja. Revisa la lectura pendiente antes de escanear otra vez."); }
  const value = await response.json();
  if (!response.ok) throw new ScannerError(value.error?.message ?? "No se pudo conectar con la caja.", response.status, value.error?.code ?? "");
  return value;
}

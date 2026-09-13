import { fiscalResponseStatus } from "../domain/fiscal-payload";

export type ProviderResponse = Record<string, unknown>;
export interface FiscalProvider {
  send(payload: ProviderResponse): Promise<ProviderResponse>;
  consult(payload: ProviderResponse): Promise<ProviderResponse | null>;
}
export interface DeliveryRepository<T> {
  complete(response: ProviderResponse, status: "ISSUED" | "SUBMITTED"): Promise<T>;
  uncertain(message: string): Promise<void>;
}

/** Provider calls are outside DB transactions; only the current lease may settle. */
export async function deliverDocument<T>(provider: FiscalProvider, repository: DeliveryRepository<T>, payload: ProviderResponse, retry: boolean): Promise<T> {
  let response: ProviderResponse;
  try {
    // An ambiguous consultation must NEVER be interpreted as permission to send.
    const found = retry ? await provider.consult({ operacion: "consultar_comprobante", tipo_de_comprobante: payload.tipo_de_comprobante, serie: payload.serie, numero: payload.numero }) : null;
    response = found ?? await provider.send(payload);
    if (response.errors) throw new Error(String(response.errors));
  } catch (error) {
    await repository.uncertain(error instanceof Error ? error.message : "No se pudo confirmar el comprobante.");
    throw error;
  }
  const status = fiscalResponseStatus(response);
  // Persistence/audit failures are not provider rejections. Leave the lease
  // recoverable; the next attempt consults the already reserved identity.
  return repository.complete(response, status === "ISSUED" ? "ISSUED" : "SUBMITTED");
}

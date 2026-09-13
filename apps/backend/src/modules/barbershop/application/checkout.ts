import { AppointmentCheckoutError, assertAppointmentPayable, cashContribution } from "../domain/checkout";

export type AppointmentForCheckout = { id: string; status: string; paid: boolean; priceCents: number };
export interface AppointmentCheckoutPort<Sale> {
  appointment(): Promise<AppointmentForCheckout | null>;
  cash(): Promise<{ id: string; balanceBasis: string } | null>;
  claim(appointment: AppointmentForCheckout): Promise<void>;
  record(appointment: AppointmentForCheckout, cashId: string, method: string): Promise<Sale>;
  applyCash(cashId: string, amountCents: number): Promise<void>;
  audit(sale: Sale): Promise<void>;
}

/** The adapter binds every operation to one transaction. */
export async function checkoutAppointmentUseCase<Sale>(port: AppointmentCheckoutPort<Sale>, method: string) {
  const appointment = await port.appointment();
  if (!appointment) throw new AppointmentCheckoutError("NOT_FOUND", "La cita no existe en esta empresa o sucursal.");
  assertAppointmentPayable(appointment);
  const cash = await port.cash();
  if (!cash) throw new AppointmentCheckoutError("CASH_CLOSED", "Abre una caja antes de registrar el cobro.");
  const cashCents = cashContribution(cash.balanceBasis, method, appointment.priceCents);
  await port.claim(appointment);
  const sale = await port.record(appointment, cash.id, method);
  await port.applyCash(cash.id, cashCents);
  await port.audit(sale);
  return sale;
}

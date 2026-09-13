export class AppointmentCheckoutError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export function assertAppointmentPayable(appointment: { status: string; paid: boolean }) {
  if (appointment.paid) throw new AppointmentCheckoutError("ALREADY_PAID", "Esta cita ya fue cobrada.");
  if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(appointment.status)) throw new AppointmentCheckoutError("APPOINTMENT_CLOSED", "La cita está cerrada y no puede cobrarse.");
}

export function cashContribution(balanceBasis: string, method: string, amountCents: number) {
  if (balanceBasis !== "CASH_ONLY") throw new AppointmentCheckoutError("CASH_RECONCILIATION_REQUIRED", "Cierra la caja anterior conciliando todos sus medios de pago y abre un nuevo turno para controlar efectivo.");
  return method === "CASH" ? amountCents : 0;
}

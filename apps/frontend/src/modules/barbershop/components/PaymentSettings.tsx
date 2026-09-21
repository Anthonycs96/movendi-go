"use client";
import type { BarbershopData } from "@movendi/contracts";
import { Card, OperationForm } from "@/shared/components/ui";
import { paymentLabels, salonCan } from "./salon-ui";
export function PaymentSettings({ data }: { data: BarbershopData }) {
  return <Card className="panel"><h3>Medios de pago del salón</h3><p>{data.paymentMethods?.map((m) => paymentLabels[m]).join(" · ")}</p><OperationForm allowed={salonCan(data, "settings:write")} title="Configurar medios de pago" triggerLabel="Editar medios de pago" endpoint="/api/operations/barbershop/payment-methods" transform={(f) => ({ methods: f.getAll("methods") })}>{["CASH", "YAPE", "PLIN", "CARD", "TRANSFER", "OTHER"].map((m) => <label key={m}><input type="checkbox" name="methods" value={m} defaultChecked={data.paymentMethods?.includes(m)} /> {paymentLabels[m]}</label>)}</OperationForm></Card>;
}

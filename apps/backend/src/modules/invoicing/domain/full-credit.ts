import { dateInPeru } from "./document";

export function fullCreditPayload(original: Record<string, unknown>, series: string, number: number, reason: string, date: Date) {
  return { ...original, tipo_de_comprobante: 3, serie: series, numero: number, fecha_de_emision: dateInPeru(date),
    documento_que_se_modifica_tipo: original.tipo_de_comprobante, documento_que_se_modifica_serie: original.serie,
    documento_que_se_modifica_numero: original.numero, tipo_de_nota_de_credito: 6, observaciones: reason };
}

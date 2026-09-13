import { selectPreparationLines, type PreparationChange, type PreparationLine } from "../domain/preparation-transition";
export interface PreparationPort {
  claim(): Promise<void>;
  lines(): Promise<PreparationLine[]>;
  cancelIngredients(): Promise<void>;
  updateLines(ids: string[]): Promise<void>;
  finish(): Promise<void>;
  audit(): Promise<void>;
}
export async function changePreparation(port: PreparationPort, change: PreparationChange, policy: Parameters<typeof selectPreparationLines>[2]) {
  await port.claim();
  const selected = selectPreparationLines(await port.lines(), change, policy);
  if (change.status === "CANCELLED") await port.cancelIngredients();
  await port.updateLines(selected.map((line) => line.id));
  await port.finish();
  await port.audit();
}

export interface OrderStatePort { claim(): Promise<void>; cancel(): Promise<void>; update(): Promise<void>; audit(): Promise<void> }
export async function changeOrderState(port: OrderStatePort, status: string) {
  await port.claim();
  if (status === "CANCELLED") await port.cancel(); else await port.update();
  await port.audit();
}

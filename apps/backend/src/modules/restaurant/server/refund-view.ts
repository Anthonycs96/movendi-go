export function refundView(refund: { id: string; reason: string; creditStatus: string; creditError: string | null; creditResponse: string | null } | null) {
  if (!refund) return null;
  let result: Record<string, unknown> = {};
  try { result = JSON.parse(refund.creditResponse ?? "{}"); } catch { /* A legacy response may not be JSON. */ }
  const url = (key: string) => typeof result?.[key] === "string" && /^https:\/\//i.test(result[key]) ? result[key] : null;
  return { id: refund.id, reason: refund.reason, creditStatus: refund.creditStatus, creditError: refund.creditError, pdfUrl: url("enlace_del_pdf"), xmlUrl: url("enlace_del_xml"), cdrUrl: url("enlace_del_cdr") };
}

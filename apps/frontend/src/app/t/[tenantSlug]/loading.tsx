export default function TenantLoading() {
  return <div className="page-container workspace-loading" role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">Cargando información de la operación…</span>
    <div className="workspace-loading__header"><i /><div><i /><i /></div></div>
    <div className="workspace-loading__metrics">{Array.from({ length: 4 }, (_, index) => <div key={index}><i /><i /><i /></div>)}</div>
    <div className="workspace-loading__panel"><i /><i /><i /><i /><i /></div>
  </div>;
}

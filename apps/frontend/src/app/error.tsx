"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main className="app-error" role="alert"><span><AlertTriangle size={25} /></span><h1>No pudimos cargar esta sección</h1><p>El resto de la plataforma sigue disponible. Puedes volver a intentar sin perder tu sesión.</p>{error.digest ? <small>Referencia: {error.digest}</small> : null}<button type="button" className="button button--primary" onClick={() => retry()}><RefreshCw size={15} />Volver a intentar</button></main>;
}

import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return <main className="not-found"><span><Compass size={28} /></span><h1>Esta vista no está disponible</h1><p>El tenant o módulo solicitado no existe, o no está habilitado para este negocio.</p><Link href="/">Volver al inicio</Link></main>;
}

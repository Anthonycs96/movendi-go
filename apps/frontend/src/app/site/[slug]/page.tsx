import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { Clock3, Instagram, Mail, MapPin, MessageCircle, Phone, Scissors, Truck, UtensilsCrossed } from "lucide-react";
import { ApiClientError, getPublicBusinessSite } from "@/shared/lib/api-client";

function money(value: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value / 100);
}

function promotionLabel(item: { kind: string; value: number; buyQuantity: number; freeQuantity: number }) {
  if (item.kind === "QUANTITY") return `${item.buyQuantity}x${item.buyQuantity - item.freeQuantity}`;
  if (item.kind === "PERCENTAGE") return `${item.value}% de descuento`;
  return `${item.value / 100} de descuento`;
}

export default async function PublicSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let site;
  try { site = (await getPublicBusinessSite(slug)).site; } catch (error) { if (error instanceof ApiClientError && error.status === 404) notFound(); throw error; }
  const whatsapp = site.whatsapp?.replace(/\D/g, "");
  const instagram = site.instagram ? (site.instagram.startsWith("http") ? site.instagram : `https://instagram.com/${site.instagram.replace(/^@/, "")}`) : null;
  const TypeIcon = site.type === "RESTAURANT" ? UtensilsCrossed : site.type === "BARBERSHOP" ? Scissors : Truck;
  const catalogTitle = site.type === "RESTAURANT" ? "Nuestra carta" : site.type === "BARBERSHOP" ? "Nuestros servicios" : "Soluciones para tu operación";
  return <main className="public-business-site" style={{ "--site-primary": site.primaryColor } as CSSProperties}>
    <header className="public-site-nav"><Link href={`/site/${site.slug}`}><span><TypeIcon size={20} /></span><strong>{site.shortName}</strong></Link><nav><a href="#servicios">Servicios</a><a href="#contacto">Contacto</a>{whatsapp ? <a className="public-site-cta" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />WhatsApp</a> : null}</nav></header>
    <section className="public-site-hero"><div><span className="public-site-kicker">SITIO OFICIAL</span><h1>{site.headline}</h1><p>{site.description}</p><div>{whatsapp ? <a className="public-site-button" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">Consultar por WhatsApp</a> : <a className="public-site-button" href="#contacto">Contáctanos</a>}<a className="public-site-button public-site-button--ghost" href="#servicios">Ver {site.type === "RESTAURANT" ? "carta" : "servicios"}</a></div></div><aside><TypeIcon size={64} /><span>{site.type === "RESTAURANT" ? "Carta actualizada" : site.type === "BARBERSHOP" ? "Reserva tu próxima visita" : "Logística que conecta"}</span></aside></section>
    {site.promotions.length ? <section className="public-site-promotions"><span>Promociones</span>{site.promotions.map((item) => <article key={item.id}><strong>{promotionLabel(item)}</strong><div><b>{item.name}</b>{item.code ? <small>Código: {item.code}</small> : null}</div></article>)}</section> : null}
    <section className="public-site-section" id="servicios"><header><span className="public-site-kicker">LO QUE OFRECEMOS</span><h2>{catalogTitle}</h2><p>Información actualizada directamente desde nuestro sistema.</p></header>
      {site.type === "RESTAURANT" ? <div className="public-site-catalog">{site.products.map((item) => <article key={item.id}><span>{item.category.name}</span><h3>{item.name}</h3><p>{item.description || "Preparado para ti."}</p><strong>{money(item.priceCents, site.currency, site.locale)}</strong></article>)}</div> : site.type === "BARBERSHOP" ? <div className="public-site-catalog">{site.services.map((item) => <article key={item.id}><span>{item.category || "Servicio"}</span><h3>{item.name}</h3><p><Clock3 size={14} /> {item.durationMinutes} minutos</p><strong>{money(item.priceCents, site.currency, site.locale)}</strong></article>)}</div> : <div className="public-site-transport"><Truck size={34} /><h3>Transporte y logística empresarial</h3><p>Coordina con nuestro equipo una solución adecuada para tu operación.</p>{whatsapp ? <a className="public-site-button" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">Solicitar información</a> : null}</div>}
    </section>
    <section className="public-site-contact" id="contacto"><div><span className="public-site-kicker">ENCUÉNTRANOS</span><h2>Hablemos</h2><p>Estamos listos para atenderte.</p></div><div className="public-site-contact-grid">{site.address ? <span><MapPin size={18} /><b>Dirección</b><small>{site.address}</small></span> : null}{site.phone ? <a href={`tel:${site.phone}`}><Phone size={18} /><b>Teléfono</b><small>{site.phone}</small></a> : null}{site.email ? <a href={`mailto:${site.email}`}><Mail size={18} /><b>Correo</b><small>{site.email}</small></a> : null}{instagram ? <a href={instagram} target="_blank" rel="noreferrer"><Instagram size={18} /><b>Instagram</b><small>{site.instagram}</small></a> : null}</div></section>
    <footer className="public-site-footer"><strong>{site.name}</strong><span>Sitio gestionado con Movendi Go</span></footer>
  </main>;
}

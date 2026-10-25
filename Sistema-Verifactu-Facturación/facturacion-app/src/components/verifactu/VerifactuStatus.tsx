'use client';

import { useVerifactuConnection } from '@/hooks/useVerifactuConnection';
import { AlertCircle, CheckCircle2, ChevronRight, Clock, WifiOff } from 'lucide-react';
import Link from 'next/link';

/**
 * El estado de la conexión con la AEAT, en la columna de la derecha del
 * panel.
 *
 * Antes era una banda a todo el ancho, en ámbar, con un párrafo de tres
 * líneas: lo primero que se leía al entrar era una advertencia aunque no
 * hubiera nada roto. Ahora es una ficha corta con el estado en una línea,
 * el detalle debajo y adónde ir para resolverlo. El tono se sigue diciendo
 * con palabras (y con el icono), no sólo con el color.
 */
export function VerifactuStatus() {
  const status = useVerifactuConnection();

  // Los días que faltan los calcula el hook, no esta función: `Date.now()`
  // durante el render devuelve algo distinto en cada repintado.
  const daysUntilExpiry = status.diasParaCaducar;
  const expiringSoon = daysUntilExpiry !== null && daysUntilExpiry < 30;

  // Sin certificado no es un error, es una tarea pendiente: ámbar y en
  // tono de «todavía», porque cada factura se sigue sellando igual.
  const estado = !status.hasCertificate
    ? {
      tono: 'aviso', Icono: WifiOff,
      titulo: 'AEAT sin conectar',
      texto: 'Tus facturas se sellan igual. Para enviarlas hace falta tu certificado digital.',
      accion: 'Cargar certificado',
    }
    : status.isChecking
      ? { tono: 'info', Icono: Clock, titulo: 'Comprobando la AEAT…', texto: 'Validando el certificado instalado.', accion: 'Ver envíos' }
      : status.isConnected
        ? {
          tono: expiringSoon ? 'aviso' : 'bien', Icono: CheckCircle2,
          titulo: 'Conectado con la AEAT',
          texto: daysUntilExpiry !== null
            ? (daysUntilExpiry > 0
              ? `Certificado activo · caduca en ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'día' : 'días'}`
              : 'El certificado ha caducado')
            : 'Certificado activo. Tus facturas se pueden enviar.',
          accion: expiringSoon ? 'Renovar certificado' : 'Ver envíos',
        }
        : {
          tono: 'peligro', Icono: AlertCircle,
          titulo: 'Sin conexión con la AEAT',
          texto: status.error || 'No se ha podido contactar con el servicio. Vuelve a intentarlo en unos minutos.',
          accion: 'Revisar',
        };

  return (
    <Link href="/verifactu" className={`aeat is-${estado.tono}`}>
      <span className="aeat-cabeza">
        <estado.Icono size={15} aria-hidden="true" className={status.isChecking ? 'spin' : undefined} />
        <span className="aeat-titulo">{estado.titulo}</span>
      </span>
      <span className="aeat-texto">{estado.texto}</span>
      <span className="aeat-pie">
        {status.lastCheck && status.hasCertificate && !status.isChecking && (
          <span className="aeat-hora">
            Comprobado a las {new Date(status.lastCheck).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <span className="aeat-accion">{estado.accion} <ChevronRight size={14} aria-hidden="true" /></span>
      </span>
    </Link>
  );
}

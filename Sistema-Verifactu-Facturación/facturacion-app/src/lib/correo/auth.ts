/**
 * LOS CORREOS DE LA CUENTA: CONFIRMAR, RECUPERAR LA CONTRASEÑA, ENTRAR…
 *
 * Los manda Supabase a través de nuestro gancho (`/api/auth/correo`), y es
 * aquí donde se escriben, en vez de en las plantillas genéricas en inglés
 * de Supabase. El enlace lleva a `/auth/confirm` de la propia app, que
 * canjea el token y deja a la persona dentro.
 */

import { correoBase } from './plantilla';

/** Lo que Supabase llama `email_action_type`. */
export type TipoCorreoAuth =
  | 'signup' | 'recovery' | 'magiclink' | 'invite' | 'email'
  | 'email_change_actual' | 'email_change_nuevo' | 'reauthentication';

/** El enlace que confirma: a la app, con el token y adónde ir después. */
export function enlaceDeConfirmacion(base: string, tokenHash: string, tipo: string, siguiente?: string): string {
  const u = new URL('/auth/confirm', base);
  u.searchParams.set('token_hash', tokenHash);
  u.searchParams.set('type', tipo);
  if (siguiente) u.searchParams.set('next', siguiente);
  return u.toString();
}

interface Entrada {
  tipo: TipoCorreoAuth;
  enlace?: string;
  codigo?: string;
  nombre?: string | null;
  correo: string;
  /** Para el cambio de correo: la dirección nueva. */
  correoNuevo?: string | null;
}

const NO_FUISTE =
  'Si no has sido tú, no hagas nada: tu cuenta sigue como estaba. Y si te llegan muchos correos así, escríbenos a administrador@klimafacturas.com.';

export function correoDeAuth(e: Entrada): { asunto: string; html: string; texto: string } {
  const saludo = e.nombre?.trim() ? `Hola, ${e.nombre.trim().split(/\s+/)[0]}:` : 'Hola,';
  const boton = (texto: string) => (e.enlace ? { texto, url: e.enlace } : undefined);
  const codigo = !e.enlace && e.codigo ? e.codigo : undefined;
  const pie = `Has recibido este correo porque se ha pedido para la cuenta ${e.correo} en KlimaFacturas.`;

  switch (e.tipo) {
    case 'signup':
      return {
        asunto: 'Confirma tu cuenta de KlimaFacturas',
        ...correoBase({
          titulo: 'Te damos la bienvenida a KlimaFacturas',
          saludo,
          parrafos: [
            'Gracias por crear tu cuenta. Falta un paso: confirma que este correo es tuyo y entrarás directamente a tu panel.',
            'Desde ahí podrás hacer tu primera factura con Veri*Factu en un par de minutos, dar de alta tus clientes y ver cómo va tu negocio.',
          ],
          boton: boton('Confirmar mi cuenta'), codigo,
          nota: `El enlace caduca en 24 horas. ${NO_FUISTE}`,
          pie,
        }),
      };
    case 'recovery':
      return {
        asunto: 'Restablece tu contraseña de KlimaFacturas',
        ...correoBase({
          titulo: 'Elige una contraseña nueva',
          saludo,
          parrafos: [
            'Nos has pedido cambiar la contraseña de tu cuenta. Pulsa el botón y escribe la nueva: tus facturas, clientes y ajustes siguen exactamente igual.',
          ],
          boton: boton('Elegir una contraseña nueva'), codigo,
          nota: `El enlace sirve una sola vez y caduca en 1 hora. ${NO_FUISTE}`,
          pie,
        }),
      };
    case 'magiclink':
    case 'email':
      return {
        asunto: codigo ? 'Tu código para entrar en KlimaFacturas' : 'Tu enlace para entrar en KlimaFacturas',
        ...correoBase({
          titulo: 'Entra en KlimaFacturas',
          saludo,
          parrafos: [codigo ? 'Escribe este código en la pantalla de acceso:' : 'Pulsa el botón y entrarás sin contraseña.'],
          boton: boton('Entrar en mi cuenta'), codigo,
          nota: `Sirve una sola vez y caduca en 1 hora. ${NO_FUISTE}`,
          pie,
        }),
      };
    case 'invite':
      return {
        asunto: 'Te han invitado a KlimaFacturas',
        ...correoBase({
          titulo: 'Tienes una invitación',
          saludo,
          parrafos: ['Te han dado acceso a una cuenta de KlimaFacturas. Acepta la invitación para entrar y elegir tu contraseña.'],
          boton: boton('Aceptar la invitación'), codigo,
          nota: `Si no esperabas esta invitación, ignora este correo. ${NO_FUISTE}`,
          pie,
        }),
      };
    case 'email_change_actual':
      return {
        asunto: 'Confirma el cambio de correo de tu cuenta',
        ...correoBase({
          titulo: 'Vas a cambiar el correo de tu cuenta',
          saludo,
          parrafos: [
            `Se ha pedido que tu cuenta deje de usar **${e.correo}** y pase a **${e.correoNuevo ?? 'otra dirección'}**. Confírmalo desde aquí para que el cambio siga adelante.`,
          ],
          boton: boton('Confirmar el cambio'), codigo,
          nota: `Si no lo has pedido tú, no pulses nada y cambia tu contraseña: alguien podría tenerla. ${NO_FUISTE}`,
          pie,
        }),
      };
    case 'email_change_nuevo':
      return {
        asunto: 'Confirma tu nuevo correo en KlimaFacturas',
        ...correoBase({
          titulo: 'Confirma tu nuevo correo',
          saludo,
          parrafos: ['Pulsa el botón para que esta dirección pase a ser la de tu cuenta de KlimaFacturas.'],
          boton: boton('Confirmar este correo'), codigo,
          nota: NO_FUISTE,
          pie: `Has recibido este correo porque se ha pedido usar esta dirección en una cuenta de KlimaFacturas.`,
        }),
      };
    case 'reauthentication':
      return {
        asunto: 'Tu código de verificación de KlimaFacturas',
        ...correoBase({
          titulo: 'Confirma que eres tú',
          saludo,
          parrafos: ['Para seguir con lo que estabas haciendo, escribe este código:'],
          codigo: e.codigo,
          nota: `Caduca en pocos minutos. ${NO_FUISTE}`,
          pie,
        }),
      };
  }
}

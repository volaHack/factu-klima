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

const NO_FUISTE = {
  titulo: '¿No has sido tú?',
  texto: 'No hagas nada: tu cuenta sigue como estaba y nadie puede entrar sin este enlace. Si te llegan muchos correos así, escríbenos a **administrador@klimafacturas.com**.',
};

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
          ceja: 'Tu cuenta',
          titulo: 'Te damos la bienvenida a KlimaFacturas',
          entradilla: 'Un clic y tu cuenta queda lista para facturar.',
          preheader: 'Confirma tu correo y entra directamente a tu panel.',
          saludo,
          parrafos: [
            'Gracias por crear tu cuenta. Falta un paso: confirma que este correo es tuyo y entrarás directamente a tu panel.',
            'Desde ahí podrás hacer tu primera factura con Veri*Factu en un par de minutos, dar de alta tus clientes y ver cómo va tu negocio.',
          ],
          listas: [{ titulo: 'Lo que puedes hacer nada más entrar', filas: [
            { texto: '**Tu primera factura con Veri*Factu**, sellada y lista para enviar' },
            { texto: '**Tus clientes y productos**, importados desde Excel si ya los tienes' },
            { texto: '**El panel**: lo facturado, lo cobrado y lo que te toca hoy' },
          ] }],
          boton: boton('Confirmar mi cuenta'), codigo,
          nota: 'El enlace caduca en 24 horas.',
          recuadro: NO_FUISTE,
          pie,
        }),
      };
    case 'recovery':
      return {
        asunto: 'Restablece tu contraseña de KlimaFacturas',
        ...correoBase({
          ceja: 'Seguridad de tu cuenta',
          titulo: 'Elige una contraseña nueva',
          entradilla: `Para la cuenta **${e.correo}**.`,
          preheader: 'Pulsa el botón y elige tu nueva contraseña. El enlace caduca en 1 hora.',
          saludo,
          parrafos: [
            'Nos has pedido cambiar la contraseña de tu cuenta. Pulsa el botón y escribe la nueva: tus facturas, clientes y ajustes siguen exactamente igual.',
            'Un consejo: usa al menos 8 caracteres y mezcla letras, números y algún símbolo. Mejor si no la usas en ningún otro sitio.',
          ],
          boton: boton('Elegir una contraseña nueva'), codigo,
          nota: 'El enlace sirve una sola vez y caduca en 1 hora.',
          recuadro: NO_FUISTE,
          pie,
        }),
      };
    case 'magiclink':
    case 'email':
      return {
        asunto: codigo ? 'Tu código para entrar en KlimaFacturas' : 'Tu enlace para entrar en KlimaFacturas',
        ...correoBase({
          ceja: 'Acceso a tu cuenta',
          titulo: 'Entra en KlimaFacturas',
          preheader: codigo ? `Tu código: ${codigo}` : 'Tu enlace para entrar sin contraseña.',
          saludo,
          parrafos: [codigo ? 'Escribe este código en la pantalla de acceso:' : 'Pulsa el botón y entrarás sin contraseña.'],
          boton: boton('Entrar en mi cuenta'), codigo,
          nota: 'Sirve una sola vez y caduca en 1 hora.',
          recuadro: NO_FUISTE,
          pie,
        }),
      };
    case 'invite':
      return {
        asunto: 'Te han invitado a KlimaFacturas',
        ...correoBase({
          ceja: 'Invitación',
          titulo: 'Tienes una invitación',
          preheader: 'Acepta la invitación y elige tu contraseña.',
          saludo,
          parrafos: ['Te han dado acceso a una cuenta de KlimaFacturas. Acepta la invitación para entrar y elegir tu contraseña.'],
          boton: boton('Aceptar la invitación'), codigo,
          nota: 'Si no esperabas esta invitación, ignora este correo.',
          recuadro: NO_FUISTE,
          pie,
        }),
      };
    case 'email_change_actual':
      return {
        asunto: 'Confirma el cambio de correo de tu cuenta',
        ...correoBase({
          ceja: 'Seguridad de tu cuenta',
          titulo: 'Vas a cambiar el correo de tu cuenta',
          preheader: 'Confirma el cambio de correo de tu cuenta.',
          saludo,
          parrafos: [
            `Se ha pedido que tu cuenta deje de usar **${e.correo}** y pase a **${e.correoNuevo ?? 'otra dirección'}**. Confírmalo desde aquí para que el cambio siga adelante.`,
          ],
          boton: boton('Confirmar el cambio'), codigo,
          recuadro: { titulo: '¿No lo has pedido tú?', texto: 'No pulses nada y cambia tu contraseña: alguien podría tenerla. Si necesitas ayuda, escríbenos a **administrador@klimafacturas.com**.' },
          pie,
        }),
      };
    case 'email_change_nuevo':
      return {
        asunto: 'Confirma tu nuevo correo en KlimaFacturas',
        ...correoBase({
          ceja: 'Tu cuenta',
          titulo: 'Confirma tu nuevo correo',
          preheader: 'Un clic para usar esta dirección en tu cuenta.',
          saludo,
          parrafos: ['Pulsa el botón para que esta dirección pase a ser la de tu cuenta de KlimaFacturas.'],
          boton: boton('Confirmar este correo'), codigo,
          recuadro: NO_FUISTE,
          pie: `Has recibido este correo porque se ha pedido usar esta dirección en una cuenta de KlimaFacturas.`,
        }),
      };
    case 'reauthentication':
      return {
        asunto: 'Tu código de verificación de KlimaFacturas',
        ...correoBase({
          ceja: 'Seguridad de tu cuenta',
          titulo: 'Confirma que eres tú',
          preheader: e.codigo ? `Tu código: ${e.codigo}` : 'Tu código de verificación.',
          saludo,
          parrafos: ['Para seguir con lo que estabas haciendo, escribe este código:'],
          codigo: e.codigo,
          nota: 'Caduca en pocos minutos.',
          recuadro: NO_FUISTE,
          pie,
        }),
      };
  }
}

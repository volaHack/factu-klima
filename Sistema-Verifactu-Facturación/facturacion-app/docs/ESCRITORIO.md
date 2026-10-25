# App de escritorio: datos locales, sesiones, firma y actualizaciones

## Qué es

`electron/` es un envoltorio: abre https://klimafacturas.com en una ventana
propia. Las pantallas, los cálculos y Veri*Factu vienen de la web; en el
equipo sólo quedan la sesión y la **copia local** (IndexedDB) para trabajar
sin conexión.

## Qué se guarda en el equipo

En `%APPDATA%\Klima Facturación` (o `Klima TPV`), **sin cifrar por la app**:

- La caché de trabajo: facturas, clientes, artículos, ajustes…
- La **cola de cambios sin subir** y la **bandeja de cambios rechazados**
  (`/sincronizacion`). Estas dos NO se borran al cerrar sesión, al caducar
  o revocar la sesión, ni al entrar otra cuenta: pueden contener ventas que
  sólo existen en este equipo. Cada cambio lleva su dueño y sólo se ve y se
  sube con la sesión de esa cuenta.
- La cookie de sesión (persiste entre reinicios).

## Requisitos del equipo (obligación del cliente; ponerlo en el contrato)

1. **Cifrado de disco**: BitLocker (Windows 10/11 Pro) o el cifrado de
   dispositivo de Windows. Sin él, quien se lleve el portátil puede leer la
   copia local copiando el disco.
2. **Cuenta de Windows con contraseña** y bloqueo de pantalla. La sesión de
   la app persiste: el equipo desbloqueado es la empresa abierta.
3. Si se pierde o roban el equipo: Ajustes → Seguridad → **Cerrar sesión en
   los demás dispositivos**, y cambiar la contraseña. El equipo borra su caché
   en cuanto se conecta (la cola de no subidos se conserva cifrada sólo si el
   disco lo está: ver punto 1).
4. Verificación en dos pasos activada para cada cuenta.

## Sin conexión

- Se puede consultar, preparar borradores, albaranes y pedidos.
- **No se emiten facturas ni tickets sin conexión**: la huella y el registro
  Veri*Factu los genera el servidor al emitir. La factura queda como borrador
  en el equipo y se emite al volver la red; en el TPV, la venta se aparca.
- Lo hecho sin conexión sube solo. Un número repetido en un borrador, albarán
  o pedido se renumera solo; lo que el servidor rechace queda en la bandeja.

## Firma del instalador

`build-app.yml` y `build-tpv.yml` exigen firma (`forceCodeSigning: true`): un
instalador sin firmar no se genera. El certificado de firma de código (OV/EV,
o Azure Trusted Signing) se pasa en el momento de compilar con `CSC_LINK` y
`CSC_KEY_PASSWORD` y **nunca** se guarda en el repositorio. Para un build de
prueba: `--config.forceCodeSigning=false`.

**Pendiente (decisión y compra):** el certificado de firma de código.

## Actualizaciones

La web se actualiza sola. El envoltorio (Electron/Chromium, con sus parches
de seguridad) no: `main.js` busca versiones nuevas con `electron-updater` si
el `config.json` del instalador trae `updatesUrl` (un servidor genérico con
los `latest.yml` y los `.exe` firmados). `verifyUpdateCodeSignature` impide
instalar una actualización que no esté firmada por el mismo editor.

**Pendiente (decisión):** dónde se publican las actualizaciones (`updatesUrl`).
Hasta entonces, cada versión nueva del envoltorio hay que instalarla a mano.

Electron pasa de 37 (sin soporte) a 45. **Sin probar en Windows** desde este
entorno: antes de publicar, generar el instalador firmado y probarlo en un
equipo real (arranque, login, TPV en quiosco, sin conexión).

## Navegación

`navegacion.js` (con pruebas, `node --test electron/navegacion.test.js`):
sólo https en el dominio de la app; otras webs se abren en el navegador del
sistema; `file:`, `data:`, `javascript:` y http sin cifrar se bloquean (antes
una URL sin host pasaba el filtro).

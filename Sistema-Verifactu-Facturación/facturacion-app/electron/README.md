# Cliente de escritorio de Klima (shell de Electron)

Dos instaladores `.exe` para Windows, ambos envoltorios de la app publicada:

| Instalador        | Config de build    | Comportamiento                                      |
| ----------------- | ------------------ | --------------------------------------------------- |
| `Klima-TPV`       | `build-tpv.yml`    | Pantalla completa (kiosk), bloqueado al terminal: tras iniciar sesión entra directo a `/tpv` y no puede salir al dashboard ni al resto de la app (cualquier otra ruta se fuerza de vuelta a `/tpv`). Sesión de cajero independiente. |
| `Klima Facturación` | `build-app.yml`  | Ventana normal abriendo la app desde el login, con libertad total de navegación. |

## Cómo se configura la URL

El instalador copia el archivo **`config.json`** junto al ejecutable
(concretamente en la carpeta `resources` del programa instalado).

Su contenido es:

```json
{
  "appUrl": "https://TU-URL-AQUI",
  "mode": "tpv"
}
```

En cuanto publiques la app con su dominio, edita ese archivo (cambia
`appUrl`) y reinicia el programa. No hace falta reinstalar ni recompilar.
El modo `mode` puede ser `tpv` o `app`.

> Si prefieres dejar la URL fija en el instalador, edita
> `config.tpv.json` o `config.app.json` **antes** de lanzar el build.

## Requisitos

- Node.js + npm.
- Primera instalación de dependencias (descarga Electron, ~100 MB):

```bash
npm install
```

## Generar los instaladores

```bash
npm run build:tpv   # → dist/tpv/Klima-TPV-Setup-1.0.0.exe
npm run build:app   # → dist/app/Klima-Facturacion-Setup-1.0.0.exe
```

## Probar en desarrollo

```bash
npm run dev
```

Abre la ventana con la URL de `config.json`. Para probar el modo TPV,
cambia `"mode"` a `"tpv"` en `config.json` (o usa `config.tpv.json`).

## Notas de seguridad

- `contextIsolation` activado, `nodeIntegration` desactivado, preload mínimo.
- Sin ventanas emergentes ni navegación a dominios ajenos (los enlaces externos se abren en el navegador del sistema).
- Sin herramientas de desarrollo: `F12` y `Ctrl+Shift+I` bloqueados; en TPV `F11` alterna el modo kiosk.
- En el modo TPV el cajero queda encerrado en `/tpv`: las navegaciones internas de la SPA y las del servidor se interceptan y fuerzan de vuelta al terminal, se oculta el enlace "Salir del TPV" y el historial (`Alt+←` / `Alt+→`) queda bloqueado. La única ruta no-`/tpv` permitida es el propio login.
- La sesión del TPV se guarda aparte (`%APPDATA%\Klima TPV`): el cajero no comparte cookies con la app de facturación.

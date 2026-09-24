/**
 * LA APP DE ANDROID QUE SE OFRECE EN /instalar
 *
 * El APK sale de `klima-android/` (Trusted Web Activity: esta misma web
 * con el motor de Chrome) y se copia a `public/descargas/`. Al publicar
 * una versión nueva se cambian aquí los cuatro datos; la huella es la del
 * fichero (`sha256sum`), para que quien quiera pueda comprobar que lo que
 * ha bajado es lo que se publicó.
 */
export const APP_ANDROID = {
  version: '1.0.0',
  ruta: '/descargas/Klima-Android-1.0.0.apk',
  tamanoMb: 3.8,
  sha256: '3858e9f42b3e73980bb94ce243f181bfc58a244742b1dfdbbf179ee9317dc5d6',
  androidMinimo: '6.0',
} as const;

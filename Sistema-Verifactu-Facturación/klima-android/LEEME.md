# Klima para Android

La app de Android es la **misma web** (facturacion-app) abierta en una
*Trusted Web Activity*: Chrome a pantalla completa, sin barra de
direcciones, con su icono y su pantalla de arranque. Por eso funciona igual
sin conexión (service worker + IndexedDB) y sincroniza con Supabase igual
que la web.

## Compilar

Hace falta el JDK (17 o superior) y el SDK de Android (`local.properties`).

    set JAVA_HOME=C:\Program Files\Java\jdk-23
    gradlew assembleRelease

El APK sale en `app/build/outputs/apk/release/app-release.apk`. Para
publicarlo, se copia a `facturacion-app/public/descargas/` con la versión
en el nombre y se actualizan los datos de `facturacion-app/src/lib/descargas.ts`
(versión, ruta, tamaño y `sha256sum`).

Al sacar una versión nueva, sube `versionCode` y `versionName` en
`app/build.gradle`: Android no instala encima una versión con el mismo
`versionCode`.

## La firma

La clave está **fuera del repositorio**, en `C:\Users\volit\klima-android-firma\`
(`klima-release.jks` y `claves.properties` con la contraseña). Para
compilar, copia `claves.properties` a esta carpeta (git la ignora).

**Guárdala en un sitio seguro.** Todas las actualizaciones tienen que ir
firmadas con esta misma clave: si se pierde, los teléfonos no aceptarán la
versión nueva encima de la vieja y habrá que desinstalar y volver a
instalar. Su huella SHA-256 está publicada en
`facturacion-app/public/.well-known/assetlinks.json`; si alguna vez cambia
la clave, hay que cambiar también esa huella.

# Núcleo de navegación móvil — responsividad y cierre del menú (2026-08-08)

## Origen

El usuario reporta que el menú lateral en móvil no se puede cerrar, y pide una pasada general de responsividad/adaptabilidad. Alcance acordado con el usuario: núcleo de navegación (Sidebar, Header, MobileNav, AccountMenu, CommandPalette) — los componentes que aparecen en todas las páginas — en vez de una auditoría página por página.

## Diagnóstico (código, no documentación)

1. **`.sidebar-overlay` no tiene ninguna regla CSS.** El componente `Sidebar.tsx` renderiza `<div className="sidebar-overlay ...">` pero `globals.css` no define esa clase — es un `<div>` vacío sin `position`, sin fondo, sin `z-index`. No cubre la pantalla ni es clicable como scrim.
2. **`.sidebar-close-mobile` está oculto por un inline `style={{ display: 'none' }}` en el JSX** que ninguna regla CSS anula. El botón de cerrar existe en el DOM pero es permanentemente invisible, en cualquier breakpoint.
3. Consecuencia: en móvil, la única forma de cerrar el cajón es pulsar un enlace de navegación (que además navega). No hay forma de cerrarlo "en el sitio".
4. **z-index empatado**: `.sidebar` y `.mobile-nav` comparten `z-index: 100`. Al abrir el cajón (ancho 256px en móvil), la barra inferior — que ocupa todo el ancho — pinta por encima del cajón en la franja `x: [0, 256px]` porque aparece después en el DOM. La barra inferior "atraviesa" visualmente el menú abierto.
5. **Sin `Escape` para cerrar** el cajón (sí lo tienen `AccountMenu` y `CommandPalette` — inconsistente).
6. **Sin bloqueo de scroll de fondo** mientras el cajón está abierto — el contenido detrás se puede desplazar con el dedo.
7. **Buscador inexistente en móvil**: `.header-search` se oculta por completo en el breakpoint de 768px sin ningún sustituto. El Command Palette (Ctrl+K) sigue siendo completamente funcional pero no hay forma táctil de invocarlo.
8. **`.account-dropdown` con `width: 280px` fijo**, `position: absolute; right: 0`. En viewports de 320–360px puede desbordar el borde de la pantalla.

## Cambios propuestos

### 1. Arreglo raíz del cajón móvil (`globals.css`, `Sidebar.tsx`)
- Añadir `.sidebar-overlay`: `position: fixed; inset: 0`, fondo `var(--bg-overlay)`, `opacity`/`pointer-events` controlados por `.visible`, transición, `z-index` entre header y sidebar. Oculto por completo en desktop (no hay cajón que tapar).
- Quitar el `style={{ display: 'none' }}` inline de `sidebar-close-mobile` en el JSX; controlar su visibilidad solo por CSS (oculto en desktop, visible dentro del breakpoint móvil, `min-height`/`min-width: 44px` como los demás botones táctiles).

### 2. Reordenar la pila de z-index
Definir un orden explícito para el contexto móvil: header < mobile-nav < overlay < sidebar (drawer) < botón de plegado. Así el cajón y su overlay siempre quedan por encima de la barra inferior, sin depender del orden del DOM.

### 3. Cierre completo y accesible (`Sidebar.tsx`, `AuthWrapper.tsx`)
- Listener de `Escape` para cerrar el cajón (mismo patrón que `AccountMenu`/`CommandPalette`).
- Bloqueo de scroll del `<body>` mientras el cajón está abierto en móvil.
- Devolver el foco al botón hamburguesa del header al cerrar (el usuario no pierde el sitio en el que estaba con teclado/lector de pantalla).

### 4. Buscador accesible en móvil (`Header.tsx`, `globals.css`)
Sustituir `.header-search` por un icono de búsqueda visible solo en el breakpoint móvil que abre el mismo `CommandPalette` vía `onSearchClick` (ya existe la prop, solo falta el disparador visible).

### 5. `AccountMenu` no se sale de la pantalla (`globals.css`)
Cambiar el ancho fijo de `.account-dropdown` por `width: min(280px, calc(100vw - 2 * var(--space-4)))` y ajustar el offset para que no se corte en viewports estrechos.

## Fuera de alcance (explícitamente, para este ciclo)
Auditoría responsive de páginas individuales (Dashboard, Facturas, Clientes, Productos, Informes, Ajustes, Verifactu, Integridad, portal de Aprobación) — quedan para un ciclo posterior si se confirman problemas concretos.

## Verificación
Arrancar el servidor de desarrollo y probar en viewport móvil real (375px, 390px, 768px) con las devtools del navegador:
- Abrir/cerrar el cajón con el botón hamburguesa, el botón X, tocando el overlay, con `Escape`, y navegando a un enlace.
- Confirmar que la barra inferior no se ve por encima del cajón abierto.
- Confirmar que el fondo no hace scroll mientras el cajón está abierto.
- Abrir el buscador móvil y confirmar que el Command Palette funciona igual que en desktop.
- Abrir el menú de cuenta en un viewport de 320px y confirmar que el desplegable no se corta.
- Repetir en desktop (>1024px) para confirmar que no hay regresión (cajón, plegado, buscador de header).

# Núcleo de navegación móvil — Implementation Plan

> **For Claude:** Este plan no usa TDD clásico porque el repo no tiene suite de tests (confirmado: cero tests, sin Playwright configurado en CI) y el cambio es visual/CSS — la verificación de cada tarea es manual en navegador (dev server + devtools con viewport móvil), no un test automatizado. Ejecutar tarea por tarea, commit tras cada una.

**Goal:** Arreglar el cierre del menú lateral en móvil (bug raíz: CSS ausente + inline style muerto) y pulir el núcleo de navegación (Sidebar, Header, MobileNav, AccountMenu) para que sea completamente funcional y responsive.

**Architecture:** Cambios contenidos en 3 archivos: `src/app/globals.css` (estilos/z-index), `src/components/layout/Sidebar.tsx` (comportamiento del cajón), `src/components/layout/Header.tsx` + `src/components/AuthWrapper.tsx` (buscador móvil + devolución de foco). Sin nuevas dependencias.

**Tech Stack:** Next.js 16 (App Router), React 19, CSS plano (sin CSS modules ni Tailwind — el proyecto usa `globals.css` con variables custom).

**Diseño de referencia:** `docs/plans/2026-08-08-mobile-nav-responsive-design.md`

---

### Task 1: Arreglo raíz — overlay del cajón móvil y botón de cierre

**Files:**
- Modify: `src/app/globals.css` (bloque `--- Sidebar ---`, alrededor de la línea 281, y bloque `@media (max-width: 768px)` alrededor de la línea 1869)
- Modify: `src/components/layout/Sidebar.tsx:102-108`

**Step 1: Añadir la regla base de `.sidebar-overlay` (oculta en desktop)**

Justo antes de la regla `.sidebar {` (línea ~281) en `globals.css`, añadir:

```css
.sidebar-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 99;
  background: var(--bg-overlay);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--transition-base);
}
```

**Step 2: Activar el overlay dentro del breakpoint móvil**

Dentro de `@media (max-width: 768px) { ... }` (línea ~1869), justo después de la línea `.sidebar.open { transform: translateX(0); }`, añadir:

```css
  .sidebar-overlay { display: block; }
  .sidebar-overlay.visible { opacity: 1; pointer-events: auto; }
```

**Step 3: Quitar el inline style muerto del botón de cerrar en `Sidebar.tsx`**

En `src/components/layout/Sidebar.tsx`, el botón de cerrar (líneas 102-108) tiene actualmente:

```tsx
          <button
            className="btn btn-ghost sidebar-close-mobile"
            onClick={onClose}
            style={{ marginLeft: 'auto', display: 'none' }}
          >
            <ChevronLeft size={20} />
          </button>
```

Sustituir por (se quita `display: 'none'` del inline style — esa regla es la que impedía que el botón se viera NUNCA, en cualquier breakpoint — y se añade `aria-label` porque el botón solo tiene un icono):

```tsx
          <button
            className="btn btn-ghost btn-icon sidebar-close-mobile"
            onClick={onClose}
            aria-label="Cerrar menú"
            style={{ marginLeft: 'auto' }}
          >
            <ChevronLeft size={20} />
          </button>
```

**Step 4: Añadir el CSS del botón de cierre**

En `globals.css`, justo después de `.sidebar-logo-text span { ... }` (línea ~316), añadir:

```css
.sidebar-close-mobile { display: none; }
```

Dentro del mismo bloque `@media (max-width: 768px)` del Step 2, añadir:

```css
  .sidebar-close-mobile {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
  }
```

**Step 5: Verificación manual**

Arrancar el dev server:

```bash
npm run dev
```

Abrir `http://localhost:3000/dashboard` en el navegador, abrir devtools, activar el modo responsive y fijar el viewport a 390×844 (iPhone 12/13/14). Recargar.

- Pulsar el botón hamburguesa del header → el cajón debe deslizarse desde la izquierda y debe aparecer un fondo oscuro semitransparente cubriendo el resto de la pantalla.
- Pulsar el fondo oscuro (fuera del cajón) → el cajón debe cerrarse.
- Volver a abrir el cajón y pulsar el botón X junto al logo → debe cerrarse.
- Confirmar en la pestaña Elements que `.sidebar-close-mobile` es visible (no `display:none`) con el viewport móvil activo.

Expected: las tres formas de cerrar funcionan. Sin esto, no continuar al Task 2.

**Step 6: Commit**

```bash
git add src/app/globals.css src/components/layout/Sidebar.tsx
git commit -m "fix: el menú lateral móvil ahora se puede cerrar (overlay y botón sin estilos)"
```

---

### Task 2: Reordenar z-index para que el cajón quede siempre por encima de la barra inferior

**Files:**
- Modify: `src/app/globals.css:462` (bloque `.mobile-nav`)

**Contexto:** `.sidebar` tiene `z-index: 100` y `.mobile-nav` también tiene `z-index: 100` (línea 462). Como `.mobile-nav` aparece más tarde en el DOM (ver `AuthWrapper.tsx`), en un empate de z-index pinta por encima del cajón en la franja que ambos ocupan — la barra inferior "atraviesa" visualmente el menú abierto. `.sidebar-overlay` ya quedó en 99 (Task 1), por debajo del cajón (100) — solo falta bajar `.mobile-nav`.

**Step 1: Bajar el z-index de `.mobile-nav`**

En `globals.css`, cambiar:

```css
.mobile-nav {
  display: none;
  position: fixed; bottom: 0; left: 0; right: 0;
  height: var(--mobile-nav-height);
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  z-index: 100;
```

a:

```css
.mobile-nav {
  display: none;
  position: fixed; bottom: 0; left: 0; right: 0;
  height: var(--mobile-nav-height);
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  z-index: 95;
```

**Step 2: Verificación manual**

Con el dev server corriendo y el viewport en 390×844: abrir el cajón lateral y mirar la esquina inferior izquierda, donde el cajón (256px de ancho) se superpone a la barra de navegación inferior.

Expected: el cajón (y su overlay) se ven POR ENCIMA de la barra inferior — la barra inferior no debe ser visible sobre el área cubierta por el cajón.

**Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "fix: el cajón móvil ya no queda tapado por la barra de navegación inferior"
```

---

### Task 3: Escape para cerrar, bloqueo de scroll de fondo y devolución de foco

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (import y cuerpo del componente)
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/AuthWrapper.tsx`

**Step 1: Añadir el efecto de Escape + bloqueo de scroll en `Sidebar.tsx`**

Justo después del `useEffect` existente que carga `brandName`/`sectorIcon` (después de la línea 83, `}, [pathname]);`), añadir un segundo `useEffect`:

```tsx
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);
```

Este patrón es el mismo que ya usa `AccountMenu.tsx` para su propio `Escape` — mantiene el estilo del repo.

**Step 2: Preparar `Header.tsx` para recibir una ref del botón hamburguesa**

En `src/components/layout/Header.tsx`, cambiar la interfaz de props:

```tsx
interface HeaderProps {
  onMenuClick: () => void;
  onSearchClick: () => void;
  menuButtonRef?: React.Ref<HTMLButtonElement>;
}
```

Y la firma del componente:

```tsx
export default function Header({ onMenuClick, onSearchClick, menuButtonRef }: HeaderProps) {
```

Y el botón hamburguesa (línea ~60):

```tsx
      <button className="header-menu-btn" onClick={onMenuClick} ref={menuButtonRef} aria-label="Abrir menú">
        <Menu size={24} />
      </button>
```

**Step 3: Devolver el foco al hamburguesa al cerrar, desde `AuthWrapper.tsx`**

En `src/components/AuthWrapper.tsx`, añadir `useRef` al import de React (línea 3):

```tsx
import { useState, useEffect, useRef } from 'react';
```

Declarar la ref junto a los demás `useState` (después de la línea 25):

```tsx
  const menuButtonRef = useRef<HTMLButtonElement>(null);
```

Cambiar el `onClose` que se pasa a `Sidebar` (línea ~96):

```tsx
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => {
          setSidebarOpen(false);
          menuButtonRef.current?.focus();
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
      />
```

Y pasar la ref a `Header` (línea ~102):

```tsx
        <Header onMenuClick={() => setSidebarOpen(true)} onSearchClick={() => setCmdOpen(true)} menuButtonRef={menuButtonRef} />
```

**Step 4: Verificación manual**

Con el dev server corriendo, viewport 390×844:

- Abrir el cajón, pulsar `Escape` → debe cerrarse, y el foco (visible como anillo de foco al navegar con Tab después) debe estar en el botón hamburguesa.
- Abrir el cajón e intentar hacer scroll en el fondo (arrastrando con el ratón sobre el contenido detrás del overlay, o con la rueda) → el contenido de fondo NO debe moverse mientras el cajón está abierto.
- Cerrar el cajón → el scroll de fondo debe volver a funcionar normalmente.

**Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Header.tsx src/components/AuthWrapper.tsx
git commit -m "feat: Escape cierra el menú móvil, bloquea el scroll de fondo y devuelve el foco al abrir/cerrar"
```

---

### Task 4: Buscador accesible en móvil (Command Palette)

**Files:**
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/app/globals.css`

**Contexto:** `.header-search` (la barra de búsqueda de escritorio) se oculta por completo en el breakpoint de 768px sin ningún sustituto — en móvil se pierde toda forma de invocar el Command Palette (Ctrl+K no existe en teclados táctiles). `Header` ya recibe `onSearchClick` como prop; solo falta un disparador visible en móvil.

**Step 1: Añadir el botón en `Header.tsx`**

Dentro de `<div className="header-actions">` (línea ~82), como primer hijo, antes del badge de Verifactu:

```tsx
      <div className="header-actions">
        <button
          className="btn btn-ghost btn-icon header-search-btn-mobile"
          onClick={onSearchClick}
          aria-label="Buscar"
        >
          <Search size={20} />
        </button>
        {verifactuActive && (
```

(`Search` ya está importado en la línea 4 de `Header.tsx` — se reutiliza el mismo icono que usa la barra de escritorio.)

**Step 2: CSS — oculto en desktop, visible en móvil**

En `globals.css`, después de la regla `.header-menu-btn:hover { ... }` (línea ~453), añadir:

```css
.header-search-btn-mobile { display: none; }
```

Dentro de `@media (max-width: 768px)`, junto a la regla existente `.header-menu-btn { display: flex; ... }` (línea ~1895), añadir:

```css
  .header-search-btn-mobile {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
  }
```

**Step 3: Verificación manual**

Viewport 390×844: confirmar que aparece un icono de lupa en el header (donde antes no había nada tras ocultarse la barra de búsqueda). Pulsarlo → debe abrirse el mismo Command Palette que Ctrl+K abre en escritorio, con los mismos resultados. Confirmar en viewport de escritorio (>1024px) que el icono NO aparece (la barra de búsqueda de escritorio sigue igual).

**Step 4: Commit**

```bash
git add src/components/layout/Header.tsx src/app/globals.css
git commit -m "feat: añadir buscador accesible en móvil (abre el Command Palette)"
```

---

### Task 5: El menú de cuenta no se debe salir de la pantalla en móviles estrechos

**Files:**
- Modify: `src/app/globals.css:2561`

**Step 1: Cambiar el ancho fijo por uno acotado al viewport**

En `globals.css`, dentro de `.account-dropdown` (línea ~2559), cambiar:

```css
.account-dropdown {
  position: absolute; top: calc(100% + 10px); right: 0;
  width: 280px;
```

a:

```css
.account-dropdown {
  position: absolute; top: calc(100% + 10px); right: 0;
  width: min(280px, calc(100vw - 2 * var(--space-4)));
```

**Step 2: Verificación manual**

Viewport 320×568 (iPhone SE, el más estrecho habitual): abrir el menú de cuenta (arriba a la derecha) → el desplegable completo debe verse dentro de los límites de la pantalla, sin cortarse por el borde izquierdo ni provocar scroll horizontal.

**Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "fix: el menú de cuenta no se corta en móviles estrechos (320-360px)"
```

---

### Task 6: Pasada final de verificación cruzada

**Files:** ninguno (solo verificación)

**Step 1: Verificar en los tres breakpoints de referencia**

Con el dev server corriendo, repetir en cada uno de estos viewports: 375×667 (iPhone SE/8), 390×844 (iPhone 12-14), 768×1024 (iPad portrait) y también en desktop (>1024px, sin devtools):

- Abrir/cerrar el cajón por las 4 vías: botón hamburguesa → botón X, hamburguesa → tap en overlay, hamburguesa → Escape, hamburguesa → clic en un enlace de navegación.
- Confirmar que la barra inferior no aparece por encima del cajón abierto.
- Confirmar que el buscador móvil abre el Command Palette y que el Command Palette sigue funcionando igual en escritorio.
- Confirmar que el menú de cuenta no se corta en 320-375px.
- En desktop, confirmar que el plegado del sidebar (`sidebar-collapse-btn`) sigue funcionando sin regresión y que no aparece ningún icono de búsqueda móvil.

**Step 2: Revisar la consola del navegador**

Sin errores ni warnings nuevos de React (hydration mismatch, etc.) en ninguno de los viewports probados.

**Step 3: Commit final (si hubo ajustes de la verificación)**

Si la verificación no requirió cambios, no hay commit adicional — el trabajo ya quedó registrado en los Tasks 1-5.

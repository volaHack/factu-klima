# Diseño: Gestión de Categorías PRO MAX

**Fecha:** 2026-07-31  
**Módulo:** Sistema de Facturación - Gestión de Productos  
**Objetivo:** Permitir crear, editar y borrar categorías de productos con interfaz visual profesional en la página de productos

## 1. Ubicación & Estructura

### Página: `/productos`
Reorganización del layout:

```
┌─────────────────────────────────────────────────┐
│ HEADER (sin cambios)                            │
│ "Productos" | 12 productos en catálogo          │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ FILTROS (sin cambios)                           │
│ [🔍 Buscar...] [Todas] [🍎 Frutas] [🥕 Verduras]│
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ ✨ NUEVO: TARJETAS DE CATEGORÍAS                │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │   🍎     │  │   🥕     │  │   🥛     │      │
│  │ Frutas   │  │Verduras  │  │ Lácteos  │      │
│  │ 5 prods  │  │ 3 prods  │  │ 2 prods  │      │
│  │ ✏️ 🗑️   │  │ ✏️ 🗑️   │  │ ✏️ 🗑️   │      │
│  └──────────┘  └──────────┘  └──────────┘      │
│                                                  │
│  [+ Nueva Categoría]                           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ TABLA DE PRODUCTOS (sin cambios, filtra por cat)│
└─────────────────────────────────────────────────┘
```

## 2. Tarjeta de Categoría (Componente)

### Estructura Visual
- **Icono**: Grande (40-48px), centrado, con glow accent
- **Nombre**: Bold 16-18px, editable inline
- **Contador**: "X productos" en gris suave (12px)
- **Acciones**: Botones ✏️ (editar) y 🗑️ (borrar) con hover

### Estados
| Estado | Descripción |
|--------|-------------|
| **Normal** | Fondo subtle, sombra ligera |
| **Hover** | Elevación (+4px), glow accent, cursor pointer |
| **Cargando** | Opacity 0.6, spinner pequeño |
| **Edición** | Borde pulsante accent, input activo |

### Animaciones
- **Entrada**: Fade-in + slide-up 300ms
- **Hover**: Transición suave elevación 200ms
- **Salida**: Fade-out 200ms (al borrar)

## 3. Operaciones CRUD

### CREATE: Agregar Nueva Categoría
- Botón: "+ Nueva Categoría" (inferior, o en header)
- Modal mejorado:
  - Input: Nombre de categoría
  - Grid de iconos (4 columnas): Preview + selector visual
  - Botones: [Cancelar] [Crear]
- Validación: Nombre no vacío, máx 50 caracteres
- Resultado: Card nueva aparece con fade-in

### READ: Listar Categorías
- Carga automática al montar componente
- Grid responsive:
  - Desktop: 6 columnas
  - Tablet: 3-4 columnas
  - Móvil: 2 columnas
- Muestra contador dinámico de productos por categoría

### UPDATE: Editar Categoría
**Opción A - Inline (nombre):**
- Click en nombre → input editable
- Enter/blur → guarda
- Esc → cancela

**Opción B - Modal completo (nombre + icono):**
- Click en ✏️ → Modal
- Permite cambiar nombre e icono
- Preview en tiempo real
- [Cancelar] [Guardar] con validación

Se implementa **Opción B** (más control).

### DELETE: Borrar Categoría
**Caso 1: Categoría sin productos**
- Confirmación simple: "¿Borrar 'Frutas'?"
- [Cancelar] [Sí, borrar]
- Fade-out + remove

**Caso 2: Categoría con productos**
- Modal inteligente:
  ```
  ¿Borrar categoría "Frutas"?
  ⚠️ Tiene 5 productos asociados
  
  ○ Mover a "Otros" (preseleccionado)
  ○ Mover a: [Dropdown con otras categorías]
  
  [Cancelar] [Sí, borrar]
  ```
- Los productos cambian de categoría automáticamente
- Luego borra la categoría

## 4. Restricciones & Reglas

| Restricción | Comportamiento |
|------------|----------------|
| Borrar categoría con productos | Modal de redirección (ver Caso 2) |
| Borrar última categoría | Bloqueado: "Debe haber mínimo 1 categoría" |
| Nombre duplicado | Error: "Esa categoría ya existe" |
| Nombre vacío | Disabled guardar |
| Caracteres especiales | Permitidos, máx 50 chars |

## 5. Flujo de Datos

```
getCompanyCategories()
    ↓
[Categoría1, Categoría2, ...]
    ↓
Renderizar tarjetas + contador de productos
    ↓
User action (edit/delete/create)
    ↓
addCustomCategory() / editCustomCategory() / deleteCustomCategory()
    ↓
Supabase sync (company_settings.custom_categories)
    ↓
Optimistic update + reload
```

## 6. Interfaz Visual (Temas)

### Colores
- **Fondo tarjeta**: `var(--bg-secondary)` o `var(--bg-tertiary)`
- **Glow icono**: Usa accent del usuario (emerald, sapphire, violet, amber, crimson)
- **Hover elevación**: Sombra `var(--shadow-lg)`
- **Bordes**: Subtle `var(--border-color)` o accent en edición

### Tipografía
- Nombre: `font-semibold text-base`
- Contador: `text-xs text-muted`
- Botones: Icons 16px (lucide-react)

### Spacing
- Card padding: `var(--space-4)`
- Grid gap: `var(--space-3)`
- Icon size: 40-48px

## 7. Componentes Necesarios

### Existentes (sin cambios)
- `CategoryIcon` - ya existe
- Modales actuales - reutilizar estructura

### Nuevos/Modificados
- `CategoryCard.tsx` - Card individual con acciones
- `CategoryGrid.tsx` - Grid responsiva
- Modal edición + Modal confirmación borrado

## 8. Mejoras de UX

✅ Drag & drop opcional (future): reordenar categorías  
✅ Búsqueda de categorías (si hay muchas)  
✅ Atajos de teclado (Enter=guardar, Esc=cancelar)  
✅ Toast notifications para feedback (ya existe useToast)  
✅ Debounce en edición inline  

## 9. Testing

- [ ] Crear categoría y verifica que aparece en grid
- [ ] Editar nombre e icono de categoría existente
- [ ] Borrar categoría sin productos
- [ ] Borrar categoría con productos → mover a otra
- [ ] Intentar crear duplicado → error
- [ ] Responsive en mobile/tablet
- [ ] Contador actualiza al crear producto

## 10. Documentación de Cambios

**Archivos modificados:**
- `src/app/productos/page.tsx` - Reorganizar layout
- `src/lib/storage.ts` - Agregar `editCustomCategory()`
- `src/components/ui/CategoryCard.tsx` - NUEVO
- `src/components/ui/CategoryGrid.tsx` - NUEVO

**No rompe:**
- Productos siguen filtrando bien
- Facturas no se ven afectadas
- Categorías default por sector se preservan

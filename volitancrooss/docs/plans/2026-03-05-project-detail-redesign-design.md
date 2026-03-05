# Rediseno de la Pagina de Detalle de Proyectos

**Fecha:** 2026-03-05  
**Estado:** Aprobado

## Resumen

Transformar la pagina de proyectos de una lista simple a una vista modular con tabs profesionales, chat en tiempo real, analytics con carrusel, y gestion de archivos multimedia.

## Decisiones de Diseno

| Decision | Eleccion | Razon |
|----------|----------|-------|
| Layout | Tabs horizontales | Profesional, modular, estandar en apps de gestion |
| Chat | Por proyecto, tiempo real | Organizado por contexto, Supabase Realtime incluido |
| Analytics | Carrusel CSS scroll-snap | Sin librerias externas, datos existentes en BD |
| Alcance | Admin + Cliente | Componentes compartidos con permisos diferentes |
| Storage | Supabase Storage | Ya integrado en el stack |

## Arquitectura

### Estructura de archivos

```
src/components/projects/
  project-detail-view.tsx      # Contenedor principal con tabs
  project-header.tsx           # Header con titulo, estado, breadcrumb
  tabs/
    overview-tab.tsx           # Resumen general
    analytics-tab.tsx          # Carrusel de metricas
    milestones-tab.tsx         # Timeline de hitos
    chat-tab.tsx               # Chat en tiempo real
    files-tab.tsx              # Archivos del proyecto
  chat/
    chat-container.tsx         # Contenedor con Supabase Realtime
    message-bubble.tsx         # Burbuja (texto/imagen/audio)
    message-input.tsx          # Input con adjuntos
    audio-recorder.tsx         # Grabador MediaRecorder API
    image-upload.tsx           # Upload con preview
  analytics/
    analytics-carousel.tsx     # Carrusel horizontal
    progress-card.tsx          # Progreso de milestones (ring SVG)
    budget-card.tsx            # Presupuesto vs gastos
    metrics-card.tsx           # Metricas de automatizacion
    timeline-card.tsx          # Timeline inicio-fin
  files/
    file-gallery.tsx           # Grid con previews
    file-upload-button.tsx     # Boton de subida
```

### Paginas

- `src/app/dashboard/projects/[id]/page.tsx` - Vista cliente (role="client")
- `src/app/admin/projects/[id]/page.tsx` - Refactorizar existente (role="admin")
- Ambas usan `ProjectDetailView` con prop `role`

### Flujo de datos

```
Pagina (Server Component)
  -> Fetch proyecto + milestones + metricas
  -> ProjectDetailView (Client Component)
    -> Cada tab recibe datos via props
    -> Chat: Supabase Realtime subscription
    -> Files: Supabase Storage reads
```

## Base de Datos

### Tabla: project_messages

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | uuid PK | gen_random_uuid() |
| project_id | uuid FK -> projects | ON DELETE CASCADE |
| sender_id | uuid FK -> profiles | ON DELETE SET NULL |
| content | text nullable | Texto del mensaje |
| message_type | text default 'text' | 'text', 'image', 'audio', 'file' |
| file_url | text nullable | URL en Storage |
| file_name | text nullable | Nombre original |
| file_size | integer nullable | Bytes |
| file_mime_type | text nullable | MIME type |
| audio_duration | integer nullable | Segundos (solo audio) |
| is_read | boolean default false | Leido por destinatario |
| created_at | timestamptz default now() | Timestamp |

Indices: (project_id, created_at DESC), (sender_id)

### Tabla: project_files

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| id | uuid PK | gen_random_uuid() |
| project_id | uuid FK -> projects | ON DELETE CASCADE |
| uploaded_by | uuid FK -> profiles | ON DELETE SET NULL |
| message_id | uuid FK -> project_messages nullable | null si upload directo |
| file_url | text | URL en Storage |
| file_name | text | Nombre original |
| file_size | integer nullable | Bytes |
| file_mime_type | text nullable | MIME type |
| created_at | timestamptz default now() | Timestamp |

Indice: (project_id, created_at DESC)

### Supabase Storage

Bucket: `project-files`

```
{project_id}/
  chat/
    images/    # Imagenes del chat
    audio/     # Audios del chat
  uploads/     # Archivos subidos directamente
```

### RLS Policies

- project_messages: SELECT/INSERT si sender es client_id del proyecto O es admin
- project_files: SELECT/INSERT si uploaded_by es client_id del proyecto O es admin
- Storage: download/upload solo para participantes del proyecto

## Tabs

### 1. Resumen (Overview)

Grid de cards con:
- Estado y prioridad (badges)
- Presupuesto con barra de progreso
- Fechas (inicio, fin, dias restantes)
- Progreso de milestones (% completado)
- Descripcion del proyecto
- Cliente asignado (solo admin)
- Boton editar (solo admin) -> abre dialog

### 2. Analisis (Analytics)

Carrusel CSS scroll-snap con cards:
- **Progress Card**: Anillo SVG circular, % milestones completados
- **Budget Card**: Barra de progreso coloreada (verde/amarillo/rojo), gastado vs total
- **Metrics Card**: Datos de automation_metrics por tipo. Solo visible si hay metricas
- **Timeline Card**: Barra horizontal con marcador de posicion actual

Responsive: 1 card movil, 2 tablet, 3-4 desktop

### 3. Milestones

Timeline vertical con:
- Linea vertical conectando milestones
- Iconos: check verde (completado), circulo azul (actual), circulo gris (pendiente)
- Titulo, fecha limite, fecha de completado
- Admin: agregar, editar, eliminar, toggle completado
- Cliente: solo lectura

### 4. Chat

Interface tipo WhatsApp:
- Mensajes con avatar, nombre, timestamp
- Burbujas alineadas (propias derecha, otros izquierda)
- Soporte para texto, imagenes (con preview/lightbox), audio (reproductor inline)
- Input bar: boton adjuntar (imagenes), boton microfono (grabar audio), campo de texto
- Supabase Realtime: INSERT subscription en project_messages
- Auto-scroll, boton "nuevos mensajes" si scrolleo hacia arriba
- Badge de no leidos en el tab

### 5. Archivos

Grid responsive con:
- Thumbnails para imagenes, iconos para audio/documentos
- Filtros: Todos, Imagenes, Audio, Documentos
- Fuentes: archivos del chat + uploads directos
- Click: lightbox (imagenes), reproductor (audio), descarga (otros)
- Boton subir archivo (ambos roles)

## Lista de paginas mejoradas

### Listado de proyectos

Las paginas de listado (`/dashboard/projects` y `/admin/projects`) se mejoran con cards mas ricas:
- Preview de progreso (mini barra)
- Ultimo mensaje de chat (truncado)
- Proximo milestone
- Click navega al detalle con tabs

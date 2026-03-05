# Project Detail Redesign - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:ejecutar-planes to implement this plan task-by-task.

**Goal:** Transform the project detail pages into modular tabbed views with real-time chat (text/images/audio), analytics carousel, milestone timeline, and file gallery — shared between admin and client roles.

**Architecture:** Shared component library in `src/components/projects/` consumed by both `/dashboard/projects/[id]` (client) and `/admin/projects/[id]` (admin). Server Components fetch data, Client Components handle interactivity. Supabase Realtime for chat, Supabase Storage for files.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), Supabase (Postgres + Realtime + Storage), Framer Motion

---

### Task 1: Database Migration — Create project_messages and project_files tables

**Files:**
- Migration applied via Supabase MCP

**Step 1: Apply migration for project_messages table**

```sql
-- Create project_messages table for real-time chat
CREATE TABLE project_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  content text,
  message_type text DEFAULT 'text' NOT NULL CHECK (message_type IN ('text', 'image', 'audio', 'file')),
  file_url text,
  file_name text,
  file_size integer,
  file_mime_type text,
  audio_duration integer,
  is_read boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_project_messages_project ON project_messages(project_id, created_at DESC);
CREATE INDEX idx_project_messages_sender ON project_messages(sender_id);

-- Enable RLS
ALTER TABLE project_messages ENABLE ROW LEVEL SECURITY;

-- Policy: users can read messages if they are the project client or an admin
CREATE POLICY "Users can read project messages" ON project_messages
  FOR SELECT USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM projects WHERE projects.id = project_messages.project_id AND projects.client_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Policy: authenticated users can insert messages if they are project client or admin
CREATE POLICY "Users can send project messages" ON project_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM projects WHERE projects.id = project_messages.project_id AND projects.client_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      )
    )
  );

-- Policy: users can update is_read on messages they receive
CREATE POLICY "Users can mark messages as read" ON project_messages
  FOR UPDATE USING (
    sender_id != auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM projects WHERE projects.id = project_messages.project_id AND projects.client_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      )
    )
  ) WITH CHECK (true);

-- Enable Realtime for project_messages
ALTER PUBLICATION supabase_realtime ADD TABLE project_messages;
```

**Step 2: Apply migration for project_files table**

```sql
-- Create project_files table
CREATE TABLE project_files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  message_id uuid REFERENCES project_messages(id) ON DELETE SET NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  file_mime_type text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_project_files_project ON project_files(project_id, created_at DESC);

-- Enable RLS
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

-- Policy: users can read files if they are the project client or admin
CREATE POLICY "Users can read project files" ON project_files
  FOR SELECT USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.client_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Policy: authenticated users can insert files if they are project client or admin
CREATE POLICY "Users can upload project files" ON project_files
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM projects WHERE projects.id = project_messages.project_id AND projects.client_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      )
    )
  );
```

**Step 3: Create Supabase Storage bucket**

```sql
-- Create storage bucket for project files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-files',
  'project-files',
  false,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

-- Storage policies: download if project participant
CREATE POLICY "Project participants can download files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'project-files'
    AND (
      EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id::text = (storage.foldername(name))[1]
        AND projects.client_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      )
    )
  );

-- Storage policies: upload if project participant
CREATE POLICY "Project participants can upload files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'project-files'
    AND (
      EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id::text = (storage.foldername(name))[1]
        AND projects.client_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      )
    )
  );
```

**Step 4: Verify tables exist**

Run: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('project_messages', 'project_files');`
Expected: Both tables listed.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(db): add project_messages, project_files tables and storage bucket"
```

---

### Task 2: API Routes — Chat messages and file upload endpoints

**Files:**
- Create: `src/app/api/projects/messages/route.ts`
- Create: `src/app/api/projects/files/route.ts`
- Create: `src/app/api/projects/[id]/route.ts`

**Step 1: Create project detail API for both roles**

Create `src/app/api/projects/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// GET: get project details with milestones and metrics (for both admin and client)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const adminClient = await createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  // Fetch project
  const { data: project, error } = await adminClient
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  // Check access: admin or project client
  if (!isAdmin && project.client_id !== user.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Fetch related data in parallel
  const [milestonesRes, metricsRes, clientRes, unreadRes] = await Promise.all([
    adminClient
      .from("project_milestones")
      .select("*")
      .eq("project_id", projectId)
      .order("order_index"),
    adminClient
      .from("automation_metrics")
      .select("*")
      .eq("project_id", projectId)
      .order("recorded_at", { ascending: false })
      .limit(100),
    adminClient
      .from("profiles")
      .select("id, full_name, email, company_name, avatar_url")
      .eq("id", project.client_id)
      .single(),
    adminClient
      .from("project_messages")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("is_read", false)
      .neq("sender_id", user.id),
  ]);

  return NextResponse.json({
    project,
    milestones: milestonesRes.data || [],
    metrics: metricsRes.data || [],
    client: clientRes.data || null,
    unreadCount: unreadRes.count || 0,
    role: isAdmin ? "admin" : "client",
    currentUserId: user.id,
  });
}
```

**Step 2: Create chat messages API**

Create `src/app/api/projects/messages/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function verifyProjectAccess(projectId: string) {
  const supabase = await createClient();
  const adminClient = await createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  if (!isAdmin) {
    const { data: project } = await adminClient
      .from("projects")
      .select("client_id")
      .eq("id", projectId)
      .single();
    if (!project || project.client_id !== user.id) return null;
  }

  return { user, isAdmin, adminClient };
}

// GET: fetch messages for a project
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const cursor = searchParams.get("cursor"); // created_at for pagination
  const limit = parseInt(searchParams.get("limit") || "50");

  if (!projectId) return NextResponse.json({ error: "projectId requerido" }, { status: 400 });

  const access = await verifyProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  let query = access.adminClient
    .from("project_messages")
    .select("*, profiles:sender_id(id, full_name, avatar_url, role)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ messages: (data || []).reverse() });
}

// POST: send a message
export async function POST(request: Request) {
  const body = await request.json();
  const { projectId, content, messageType, fileUrl, fileName, fileSize, fileMimeType, audioDuration } = body;

  if (!projectId) return NextResponse.json({ error: "projectId requerido" }, { status: 400 });
  if (!content && !fileUrl) return NextResponse.json({ error: "content o fileUrl requerido" }, { status: 400 });

  const access = await verifyProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { data, error } = await access.adminClient
    .from("project_messages")
    .insert({
      project_id: projectId,
      sender_id: access.user.id,
      content,
      message_type: messageType || "text",
      file_url: fileUrl || null,
      file_name: fileName || null,
      file_size: fileSize || null,
      file_mime_type: fileMimeType || null,
      audio_duration: audioDuration || null,
    })
    .select("*, profiles:sender_id(id, full_name, avatar_url, role)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If message has a file, also register in project_files
  if (fileUrl) {
    await access.adminClient.from("project_files").insert({
      project_id: projectId,
      uploaded_by: access.user.id,
      message_id: data.id,
      file_url: fileUrl,
      file_name: fileName,
      file_size: fileSize,
      file_mime_type: fileMimeType,
    });
  }

  return NextResponse.json({ message: data });
}

// PATCH: mark messages as read
export async function PATCH(request: Request) {
  const { projectId } = await request.json();
  if (!projectId) return NextResponse.json({ error: "projectId requerido" }, { status: 400 });

  const access = await verifyProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  await access.adminClient
    .from("project_messages")
    .update({ is_read: true })
    .eq("project_id", projectId)
    .neq("sender_id", access.user.id)
    .eq("is_read", false);

  return NextResponse.json({ success: true });
}
```

**Step 3: Create files API**

Create `src/app/api/projects/files/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// GET: list files for a project
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const type = searchParams.get("type"); // 'image' | 'audio' | 'document' | null (all)

  if (!projectId) return NextResponse.json({ error: "projectId requerido" }, { status: 400 });

  const supabase = await createClient();
  const adminClient = await createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let query = adminClient
    .from("project_files")
    .select("*, profiles:uploaded_by(full_name, avatar_url)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (type === "image") {
    query = query.like("file_mime_type", "image/%");
  } else if (type === "audio") {
    query = query.like("file_mime_type", "audio/%");
  } else if (type === "document") {
    query = query.not("file_mime_type", "like", "image/%").not("file_mime_type", "like", "audio/%");
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ files: data || [] });
}

// POST: upload file directly (not from chat)
export async function POST(request: Request) {
  const body = await request.json();
  const { projectId, fileUrl, fileName, fileSize, fileMimeType } = body;

  if (!projectId || !fileUrl) return NextResponse.json({ error: "projectId y fileUrl requeridos" }, { status: 400 });

  const supabase = await createClient();
  const adminClient = await createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data, error } = await adminClient.from("project_files").insert({
    project_id: projectId,
    uploaded_by: user.id,
    file_url: fileUrl,
    file_name: fileName,
    file_size: fileSize,
    file_mime_type: fileMimeType,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ file: data });
}
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(api): add project detail, messages, and files API routes"
```

---

### Task 3: Project Header Component

**Files:**
- Create: `src/components/projects/project-header.tsx`

**Step 1: Create the header component**

```typescript
"use client";

import { ArrowLeft, Clock, ArrowUpRight, Eye, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { label: string; icon: typeof Clock; class: string }> = {
  pending: { label: "Pendiente", icon: Clock, class: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  in_progress: { label: "En progreso", icon: ArrowUpRight, class: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  review: { label: "En revision", icon: Eye, class: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  completed: { label: "Completado", icon: CheckCircle2, class: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  cancelled: { label: "Cancelado", icon: XCircle, class: "bg-red-500/10 text-red-500 border-red-500/20" },
};

const priorityConfig: Record<string, { label: string; class: string }> = {
  low: { label: "Baja", class: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  medium: { label: "Media", class: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  high: { label: "Alta", class: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  urgent: { label: "Urgente", class: "bg-red-500/10 text-red-400 border-red-500/20" },
};

interface ProjectHeaderProps {
  title: string;
  status: string;
  priority: string;
  role: "admin" | "client";
}

export function ProjectHeader({ title, status, priority, role }: ProjectHeaderProps) {
  const s = statusConfig[status] || statusConfig.pending;
  const p = priorityConfig[priority] || priorityConfig.medium;
  const StatusIcon = s.icon;
  const backHref = role === "admin" ? "/admin/projects" : "/dashboard/projects";

  return (
    <div className="flex items-center gap-3">
      <Link href={backHref} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
        <ArrowLeft className="size-5" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.class}`}>
            <StatusIcon className="size-3" />
            {s.label}
          </span>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${p.class}`}>
            <AlertCircle className="size-2.5" />
            {p.label}
          </span>
        </div>
      </div>
    </div>
  );
}

export { statusConfig, priorityConfig };
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add ProjectHeader component"
```

---

### Task 4: Overview Tab Component

**Files:**
- Create: `src/components/projects/tabs/overview-tab.tsx`

**Step 1: Create the overview tab**

This component displays: status, priority, budget bar, dates with days remaining, milestone progress ring, description, and client info. Admin sees an edit button that opens a Sheet.

Key details:
- Uses shadcn `Card` for each info block
- Budget bar uses green (<80%), yellow (<95%), red (>=95%) colors
- Days remaining calculation from `end_date`
- Progress uses a mini circular SVG ring
- Admin edit opens shadcn `Sheet` with form fields for title, description, status, priority, budget, dates
- Client sees read-only view

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add OverviewTab component"
```

---

### Task 5: Analytics Tab with Carousel

**Files:**
- Create: `src/components/projects/analytics/analytics-carousel.tsx`
- Create: `src/components/projects/analytics/progress-card.tsx`
- Create: `src/components/projects/analytics/budget-card.tsx`
- Create: `src/components/projects/analytics/metrics-card.tsx`
- Create: `src/components/projects/analytics/timeline-card.tsx`
- Create: `src/components/projects/tabs/analytics-tab.tsx`

**Step 1: Create each analytics card**

- **progress-card.tsx**: SVG circular ring (stroke-dasharray/dashoffset) showing milestone completion %. Shows `X/Y completados` below.
- **budget-card.tsx**: Horizontal bar with `gastado/total`, colored green/yellow/red based on %. Shows remaining amount.
- **metrics-card.tsx**: Groups `automation_metrics` by type (workflow_executions, messages_processed, etc.). Shows each metric with icon and value. Only renders if metrics exist.
- **timeline-card.tsx**: Horizontal bar from start_date to end_date with a marker at today's position. Shows days remaining.

**Step 2: Create analytics-carousel.tsx**

CSS scroll-snap carousel with horizontal scroll, left/right navigation buttons, responsive (1/2/3-4 cards per viewport).

**Step 3: Create analytics-tab.tsx**

Composes the carousel with all cards.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add AnalyticsTab with carousel and metric cards"
```

---

### Task 6: Milestones Tab Component

**Files:**
- Create: `src/components/projects/tabs/milestones-tab.tsx`

**Step 1: Create the milestones tab**

Vertical timeline layout:
- Left side: vertical line connecting milestone dots
- Dot colors: green check (completed), blue filled (current/in_progress), gray circle (pending)
- Each milestone shows: title, due_date, completed_at
- Admin controls: add new milestone (input + button), toggle complete (click dot), delete (trash icon)
- Client: read-only, no controls
- Uses existing API at `/api/admin/projects/detail` for mutations (POST with action: add/toggle/delete)
- New client-accessible API endpoint or modify existing to allow client reads

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add MilestonesTab with timeline layout"
```

---

### Task 7: Chat Components

**Files:**
- Create: `src/components/projects/chat/message-bubble.tsx`
- Create: `src/components/projects/chat/audio-recorder.tsx`
- Create: `src/components/projects/chat/image-upload.tsx`
- Create: `src/components/projects/chat/message-input.tsx`
- Create: `src/components/projects/chat/chat-container.tsx`
- Create: `src/components/projects/tabs/chat-tab.tsx`

**Step 1: Create message-bubble.tsx**

Renders a single chat message. Props: message, isOwn, senderName, senderAvatar.
- Text: plain text with whitespace preserved
- Image: thumbnail with click-to-expand (Dialog lightbox)
- Audio: custom player with play/pause, seek bar, duration display
- File: icon + filename + download link
- Timestamp formatted relative (hace 5 min, ayer, fecha)
- Own messages aligned right (bg-primary), others left (bg-secondary)

**Step 2: Create audio-recorder.tsx**

Hook-based audio recorder using MediaRecorder API:
- States: idle, recording, recorded
- Recording: shows timer, red pulse animation, stop button
- Recorded: shows preview player + send/discard buttons
- Returns Blob on send
- Uses `audio/webm` format (browser default)

**Step 3: Create image-upload.tsx**

- Hidden file input triggered by button click
- accept="image/jpeg,image/png,image/gif,image/webp"
- Shows preview thumbnail before sending
- Returns File on confirm

**Step 4: Create message-input.tsx**

Input bar composing text input + image upload button + audio record button + send button.
- Text: Enter to send, Shift+Enter for newline (textarea auto-resize)
- Image: opens image-upload flow, on confirm calls onSendImage
- Audio: opens audio-recorder, on complete calls onSendAudio
- Props: onSendText, onSendImage, onSendAudio (callbacks)

**Step 5: Create chat-container.tsx**

Main chat logic:
- Fetches initial messages via `/api/projects/messages?projectId=X`
- Subscribes to Supabase Realtime channel `project-messages-{projectId}` for INSERT events
- On new message from Realtime: appends to list, auto-scrolls
- Sends messages via POST `/api/projects/messages`
- File upload flow: upload to Supabase Storage first, then send message with file_url
- Mark as read via PATCH when component mounts and on new messages
- Scroll management: auto-scroll to bottom, "new messages" button if scrolled up
- Uses `createClient()` from `@/lib/supabase/client` for Realtime subscription

**Step 6: Create chat-tab.tsx**

Thin wrapper that passes projectId and currentUserId to ChatContainer.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: add real-time chat components with image and audio support"
```

---

### Task 8: Files Tab Component

**Files:**
- Create: `src/components/projects/files/file-gallery.tsx`
- Create: `src/components/projects/files/file-upload-button.tsx`
- Create: `src/components/projects/tabs/files-tab.tsx`

**Step 1: Create file-gallery.tsx**

Responsive grid of file cards:
- Images: thumbnail preview (from Supabase Storage URL)
- Audio: waveform icon + duration
- Documents: file type icon
- Each card shows: preview/icon, filename (truncated), upload date, uploader name
- Click image: opens Dialog lightbox
- Click audio: plays inline
- Click document: downloads
- Filter buttons: Todos | Imagenes | Audio | Documentos

**Step 2: Create file-upload-button.tsx**

Button that opens file picker, uploads to Supabase Storage, then registers via `/api/projects/files`.

**Step 3: Create files-tab.tsx**

Composes FileGallery + FileUploadButton. Fetches files via `/api/projects/files?projectId=X`.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add Files tab with gallery and upload"
```

---

### Task 9: Project Detail View — Main Container

**Files:**
- Create: `src/components/projects/project-detail-view.tsx`

**Step 1: Create the main container**

Composes:
- `ProjectHeader` at top
- `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` from shadcn
- 5 tabs: Resumen, Analisis, Hitos, Chat (with unread badge), Archivos
- Props: project, milestones, metrics, client, role, currentUserId, unreadCount
- Chat tab trigger shows unread count as a small red badge

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add ProjectDetailView container with all tabs"
```

---

### Task 10: Dashboard Project Detail Page (Client)

**Files:**
- Create: `src/app/dashboard/projects/[id]/page.tsx`

**Step 1: Create the client-facing project detail page**

Server Component that:
1. Gets authenticated user via `createClient()`
2. Fetches project data via `createAdminClient()` (bypass RLS for joins)
3. Verifies `project.client_id === user.id`
4. Renders `<ProjectDetailView role="client" ... />`

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add client project detail page with tabs"
```

---

### Task 11: Refactor Admin Project Detail Page

**Files:**
- Modify: `src/app/admin/projects/[id]/page.tsx` (complete rewrite)

**Step 1: Rewrite admin project detail**

Convert from current monolithic "use client" form to:
1. Server Component that fetches project + milestones + metrics
2. Renders `<ProjectDetailView role="admin" ... />`
3. Remove all the inline form/milestone logic (now handled by OverviewTab and MilestonesTab)

**Step 2: Commit**

```bash
git add -A && git commit -m "refactor: rewrite admin project detail to use shared ProjectDetailView"
```

---

### Task 12: Improve Project Listing Pages

**Files:**
- Modify: `src/app/dashboard/projects/page.tsx`
- Modify: `src/app/admin/projects/page.tsx`

**Step 1: Enhance dashboard project listing**

Add to each project card:
- Link to `/dashboard/projects/{id}` (currently not linked)
- Mini progress bar (already exists)
- Last chat message preview (truncated, with relative time)
- Next upcoming milestone name

Query changes: also select latest message and next pending milestone.

**Step 2: Enhance admin project listing**

Already links to detail page. Add:
- Last chat message preview
- Unread message count badge

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: enhance project listing pages with chat preview and milestone info"
```

---

### Task 13: Build Verification

**Step 1: Run build**

Run: `bun run build`
Expected: No TypeScript errors, successful build.

**Step 2: Fix any issues found**

**Step 3: Final commit if needed**

```bash
git add -A && git commit -m "fix: resolve build issues"
```

---

## Task Dependency Graph

```
Task 1 (DB Migration)
  |
  v
Task 2 (API Routes) --> Task 3 (Header) --> Task 9 (Container)
  |                      |                       |
  v                      v                       v
Task 7 (Chat)       Task 4 (Overview)     Task 10 (Client Page)
Task 8 (Files)      Task 5 (Analytics)    Task 11 (Admin Page)
                    Task 6 (Milestones)   Task 12 (Listings)
                                               |
                                               v
                                          Task 13 (Build)
```

**Parallel groups:**
- Tasks 3-8 can all be built in parallel after Tasks 1-2
- Tasks 10-12 can be built in parallel after Task 9
- Task 13 must be last

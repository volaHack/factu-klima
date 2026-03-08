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

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

// GET: list files for a project
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const type = searchParams.get("type"); // 'image' | 'audio' | 'document' | null (all)

  if (!projectId) return NextResponse.json({ error: "projectId requerido" }, { status: 400 });

  const access = await verifyProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  let query = access.adminClient
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

// POST: register a file upload
export async function POST(request: Request) {
  const body = await request.json();
  const { projectId, fileUrl, fileName, fileSize, fileMimeType } = body;

  if (!projectId || !fileUrl) return NextResponse.json({ error: "projectId y fileUrl requeridos" }, { status: 400 });

  const access = await verifyProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { data, error } = await access.adminClient.from("project_files").insert({
    project_id: projectId,
    uploaded_by: access.user.id,
    file_url: fileUrl,
    file_name: fileName,
    file_size: fileSize,
    file_mime_type: fileMimeType,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ file: data });
}

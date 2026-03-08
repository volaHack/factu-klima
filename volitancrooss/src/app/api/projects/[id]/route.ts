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

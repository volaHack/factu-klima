import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encryptString } from '@/lib/encryption';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Usar la connection por defecto para no eludir RLS, pero como RLS prohíbe SELECT a usuarios...
    // WAIT: I added a policy that forbids SELECT for EVERYONE in the client (`USING (false)`).
    // Let's use service_role client to bypass RLS here because we NEED to know if keys exist.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Configuración del servidor incompleta' }, { status: 500 });
    }

    const { createClient: createAdminClient } = await import('@supabase/supabase-js');
    const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data } = await admin
      .from('stripe_connections')
      .select('publishable_key, encrypted_secret_key, encrypted_webhook_secret')
      .eq('user_id', user.id)
      .single();

    // The user needs a webhook URL to paste into Stripe dashboard
    const baseUrl = new URL(request.url).origin;
    const webhookUrl = `${baseUrl}/api/stripe/webhook/tenant/${user.id}`;

    if (!data) {
      return NextResponse.json({
        hasSecretKey: false,
        hasWebhookSecret: false,
        publishableKey: '',
        webhookUrl,
      });
    }

    return NextResponse.json({
      hasSecretKey: !!data.encrypted_secret_key,
      hasWebhookSecret: !!data.encrypted_webhook_secret,
      publishableKey: data.publishable_key || '',
      webhookUrl,
    });
  } catch (err) {
    console.error('Error in GET /api/stripe/tenant-keys:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const allowed = await checkRateLimit(`stripe-keys-post:${clientIpFromRequest(request)}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiados intentos' }, { status: 429 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { publishableKey, secretKey, webhookSecret } = body;

    // Aquí usamos admin también para insertar porque la tabla es sensible
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Configuración del servidor incompleta' }, { status: 500 });
    }

    const { createClient: createAdminClient } = await import('@supabase/supabase-js');
    const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const updateData: any = {};
    if (publishableKey !== undefined) updateData.publishable_key = publishableKey;
    if (secretKey) updateData.encrypted_secret_key = encryptString(secretKey);
    if (webhookSecret) updateData.encrypted_webhook_secret = encryptString(webhookSecret);
    updateData.updated_at = new Date().toISOString();

    const { error } = await admin
      .from('stripe_connections')
      .upsert(
        { user_id: user.id, ...updateData },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('Error saving stripe connections:', error);
      return NextResponse.json({ error: 'No se pudieron guardar las claves' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error in POST /api/stripe/tenant-keys:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

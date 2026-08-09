/**
 * POST /api/verifactu/health
 * Verifica la conexión con servidores de AEAT
 *
 * Usa el certificado almacenado para hacer un ping a AEAT
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Intenta conectar con AEAT usando el certificado.
 *
 * ============================================================================
 * ADVERTENCIA — INTEGRACIÓN DE DEMOSTRACIÓN, NO HAY CONEXIÓN REAL A AEAT
 * ============================================================================
 * Esta función NO abre una conexión TLS mutua con el certificado del
 * usuario ni llama a ningún endpoint autenticado de AEAT: eso requiere
 * cargar el certificado descifrado como cliente TLS, algo que tampoco está
 * implementado (ver /api/verifactu/certificate/upload).
 *
 * Antes, en cualquier entorno donde NODE_ENV no fuera exactamente
 * "production" (incluido el caso por defecto, sin NODE_ENV puesto),
 * esta función devolvía isConnected: true de forma incondicional, sin
 * comprobar nada, sólo "para poder probar la UI". El resultado era que
 * la pantalla de Verifactu mostraba "Conectado a AEAT" como si las
 * facturas ya se estuvieran enviando de verdad. Eso se ha quitado: por
 * defecto esta función informa honestamente que la conexión no se ha
 * verificado. Se puede activar un intento de comprobación real (todavía
 * sin TLS mutuo, sólo un GET de cortesía) fijando
 * AEAT_INTEGRATION_ENABLED=true, pero incluso así NO equivale a una
 * conexión autenticada con el certificado.
 * ============================================================================
 */
async function checkAEATConnectivity(): Promise<{
  isConnected: boolean;
  statusCode: string | null;
  error: string | null;
}> {
  const aeatIntegrationEnabled = process.env.AEAT_INTEGRATION_ENABLED === 'true';

  if (!aeatIntegrationEnabled) {
    return {
      isConnected: false,
      statusCode: null,
      error:
        'Integración con AEAT no implementada todavía (modo demostración). El certificado se ha guardado pero no se ha comprobado contra AEAT.',
    };
  }

  try {
    // URL del endpoint de Verifactu de AEAT
    const AEAT_ENDPOINT =
      process.env.AEAT_VERIFACTU_ENDPOINT ||
      'https://www.aeat.es/verifactu/api/v1/health';

    // TODO (integración real, pendiente): autenticación TLS mutua con el
    // certificado descifrado del usuario:
    // const response = await fetch(AEAT_ENDPOINT, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json', 'X-Certificate': certificateThumbprint },
    //   cert: certificatePEM,
    //   key: certificateKeyPEM,
    // });
    // Mientras tanto esto es sólo un GET de cortesía sin autenticación:
    // un 200 aquí NO demuestra que el certificado sea válido para AEAT.
    const response = await fetch(AEAT_ENDPOINT, {
      method: 'GET',
      headers: {
        'User-Agent': 'VerifactuClient/1.0',
      },
    });

    return {
      isConnected: response.ok,
      statusCode: String(response.status),
      error: response.ok ? null : 'AEAT no respondió correctamente',
    };
  } catch (err) {
    return {
      isConnected: false,
      statusCode: null,
      error: err instanceof Error ? err.message : 'Error de conexión',
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticación
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    // Verificar que tenga certificado activo
    const { data: cert, error: certError } = await supabase
      .from('verifactu_certificates')
      .select('id, is_aeat_connected, last_connection_check')
      .eq('user_id', user.id)
      .eq('is_valid', true)
      .eq('is_revoked', false)
      .gt('not_after', new Date().toISOString())
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .single();

    if (certError || !cert) {
      return NextResponse.json({
        isConnected: false,
        statusCode: null,
        error: 'No hay certificado activo',
      });
    }

    // Comprobar conexión con AEAT
    const connectionStatus = await checkAEATConnectivity();

    // Actualizar la base de datos con el resultado
    await supabase
      .from('verifactu_certificates')
      .update({
        is_aeat_connected: connectionStatus.isConnected,
        last_connection_check: new Date().toISOString(),
        aeat_status_code: connectionStatus.statusCode,
        last_connection_error: connectionStatus.error,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cert.id);

    // Retornar estado
    return NextResponse.json({
      isConnected: connectionStatus.isConnected,
      statusCode: connectionStatus.statusCode,
      error: connectionStatus.error,
      lastCheck: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Verifactu health check error:', err);
    return NextResponse.json(
      {
        isConnected: false,
        statusCode: null,
        error:
          err instanceof Error
            ? err.message
            : 'Error al verificar conexión',
      },
      { status: 500 }
    );
  }
}

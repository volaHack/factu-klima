/**
 * GET /api/facturae/:id — la factura en Facturae 3.2.2.
 *
 *   ?firmar=1  → firmada (XAdES-EPES) con el certificado que la empresa tiene
 *                subido para Veri*Factu: el .xsig que piden FACe y los
 *                portales autonómicos. El certificado sólo se descifra aquí.
 *   sin nada   → el XML sin firmar, para quien lo firme con AutoFirma.
 *
 * Todo se lee con la sesión del usuario (RLS): sólo sus facturas.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { decryptCertificateBlob } from '@/lib/verifactu/certificateEncryption';
import { mapClientFromDb, mapInvoiceFromDb, mapSettingsFromDb } from '@/lib/storage';
import { generarFacturae, problemasFacturae } from '@/lib/facturae/generar';
import { firmarFacturae, leerMaterialFirma } from '@/lib/facturae/firmar';

export const dynamic = 'force-dynamic';

const nombreFichero = (numero: string) => (numero || 'factura').replace(/[^A-Za-z0-9_-]+/g, '_');

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9-]{20,40}$/.test(id)) return NextResponse.json({ error: 'Factura no válida.' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!(await checkRateLimit(`facturae:${user.id}`, 60, 60))) {
    return NextResponse.json({ error: 'Demasiadas descargas seguidas. Espera un minuto.' }, { status: 429 });
  }

  const [{ data: inv }, { data: lineas }, { data: desglose }, { data: ajustes }] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', id).eq('user_id', user.id).maybeSingle(),
    supabase.from('invoice_line_items').select('*').eq('invoice_id', id).order('sort_order', { ascending: true }),
    supabase.from('invoice_tax_breakdown').select('*').eq('invoice_id', id),
    supabase.from('company_settings').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!inv) return NextResponse.json({ error: 'No se encuentra la factura.' }, { status: 404 });
  if (!ajustes) return NextResponse.json({ error: 'Rellena antes los datos de tu empresa en Ajustes.' }, { status: 400 });

  const factura = mapInvoiceFromDb(inv, lineas || [], desglose || []);
  const empresa = mapSettingsFromDb(ajustes);
  let cliente;
  if (factura.clientId) {
    const { data: fila } = await supabase.from('clients').select('*').eq('id', factura.clientId).eq('user_id', user.id).maybeSingle();
    if (fila) cliente = mapClientFromDb(fila);
  }

  const datos = { factura, empresa, cliente };
  const problemas = problemasFacturae(datos);
  if (problemas.length > 0) return NextResponse.json({ error: problemas.join(' ') }, { status: 400 });

  let xml = generarFacturae(datos);
  const firmar = request.nextUrl.searchParams.get('firmar') === '1';

  if (firmar) {
    const { data: cert } = await supabase
      .from('verifactu_certificates')
      .select('certificate_data, certificate_password_encrypted')
      .eq('user_id', user.id)
      .eq('is_valid', true)
      .eq('is_revoked', false)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cert?.certificate_data || !cert.certificate_password_encrypted) {
      return NextResponse.json({
        error: 'Para firmarla hace falta tu certificado digital (se sube en Veri*Factu). Mientras, puedes bajar el XML sin firmar y firmarlo con AutoFirma.',
      }, { status: 400 });
    }
    try {
      const material = leerMaterialFirma(
        decryptCertificateBlob(cert.certificate_data as string),
        decryptCertificateBlob(cert.certificate_password_encrypted as string).toString('utf8'),
      );
      xml = firmarFacturae(xml, material);
    } catch (e) {
      console.error('Facturae: no se ha podido firmar', e instanceof Error ? e.message : e);
      return NextResponse.json({
        error: e instanceof Error && /^(No se ha podido abrir el certificado|El certificado no trae)/.test(e.message) ? e.message : 'No se ha podido firmar con el certificado guardado. Vuelve a subirlo en Veri*Factu.',
      }, { status: 400 });
    }
  }

  const fichero = `${nombreFichero(factura.number)}.${firmar ? 'xsig' : 'xml'}`;
  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fichero}"`,
      'Cache-Control': 'no-store',
    },
  });
}

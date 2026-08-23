/**
 * Generador de payloads SOAP XML cumpliendo con el Reglamento Veri*factu*
 * (Real Decreto 1007/2023 / Orden HAC/1177/2024 de la AEAT).
 *
 * CAMBIOS RESPECTO A LA VERSIÓN ANTERIOR
 * ──────────────────────────────────────
 * 1. TipoFactura se resuelve dinámicamente (F1/F2/R1-R5), ya no es F1 fijo.
 * 2. ClaveRegimenIvaEspecial: campo obligatorio según la Orden HAC.
 * 3. Operaciones intracomunitarias: usa IDOtro + CodigoPais cuando el
 *    destinatario tiene VAT Number en vez de NIF español.
 * 4. Desglose de IVA usa el taxBreakdown agregado (correcto fiscalmente),
 *    no las líneas sueltas que duplicaban tipos si dos líneas tienen el
 *    mismo tipo impositivo.
 */

import { Invoice, CompanySettings } from '@/lib/types';
import { resolverTipoFacturaFiscal, resolverClaveRegimenIva } from '@/lib/constants';

export function generateVerifactuSoapXml(
  invoice: Invoice,
  companySettings: CompanySettings,
  environment: 'test' | 'production' = 'test'
): string {
  const isTest = environment === 'test';
  const issueDateFormatted = invoice.issueDate
    ? invoice.issueDate.split('-').reverse().join('-')
    : new Date().toLocaleDateString('es-ES');
  const hash = invoice.verifactu?.chainedHash
    || 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';

  // --- Resolución automática de campos fiscales ---
  const tipoFactura = resolverTipoFacturaFiscal(invoice);
  const claveRegimen = resolverClaveRegimenIva(invoice, companySettings);

  // --- Destinatario: NIF español o IDOtro para intracomunitarias ---
  const destinatarioXml = buildDestinatarioXml(invoice);

  // --- Desglose de IVA (usa el breakdown agregado, no las líneas) ---
  const desgloseXml = invoice.taxBreakdown.map(tb => `
          <ver:DetalleIVA>
            <ver:TipoImpositivo>${tb.rate.toFixed(2)}</ver:TipoImpositivo>
            <ver:BaseImponible>${tb.base.toFixed(2)}</ver:BaseImponible>
            <ver:CuotaRepercutida>${tb.amount.toFixed(2)}</ver:CuotaRepercutida>
          </ver:DetalleIVA>`).join('');

  // --- Factura rectificativa: referencia a la factura original ---
  const rectificativaXml = tipoFactura.startsWith('R') && invoice.documentoOrigenId
    ? `
        <ver:FacturasRectificadas>
          <ver:IDFacturaRectificada>
            <ver:NumSerieFacturaEmisor>${escapeXml(invoice.documentoOrigenNumber || '')}</ver:NumSerieFacturaEmisor>
            <ver:FechaExpedicionFacturaEmisor>${issueDateFormatted}</ver:FechaExpedicionFacturaEmisor>
          </ver:IDFacturaRectificada>
        </ver:FacturasRectificadas>
        <ver:TipoRectificativa>I</ver:TipoRectificativa>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope 
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ver="https://www.agenciatributaria.es/static_files/Sii/VERIFACTU/1.0"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <soapenv:Header/>
  <soapenv:Body>
    <ver:RegFactuSistemaFacturacion>
      <ver:Cabecera>
        <ver:ObligadoEmision>
          <ver:NombreRazon>${escapeXml(companySettings.businessName)}</ver:NombreRazon>
          <ver:NIF>${escapeXml(companySettings.nif)}</ver:NIF>
        </ver:ObligadoEmision>
        <ver:ModoEnvio>${isTest ? 'TEST_SANDBOX' : 'PROD_REAL'}</ver:ModoEnvio>
      </ver:Cabecera>
      <ver:RegistroFactura>
        <ver:IDFactura>
          <ver:IDEmisorFactura>${escapeXml(companySettings.nif)}</ver:IDEmisorFactura>
          <ver:NumSerieFacturaEmisor>${escapeXml(invoice.number)}</ver:NumSerieFacturaEmisor>
          <ver:FechaExpedicionFacturaEmisor>${issueDateFormatted}</ver:FechaExpedicionFacturaEmisor>
        </ver:IDFactura>
        <ver:NombreRazonEmisor>${escapeXml(companySettings.businessName)}</ver:NombreRazonEmisor>
        <ver:TipoFactura>${tipoFactura}</ver:TipoFactura>${rectificativaXml}
        <ver:ClaveRegimenIvaEspecial>${claveRegimen}</ver:ClaveRegimenIvaEspecial>
        <ver:Destinatarios>${destinatarioXml}
        </ver:Destinatarios>
        <ver:Desglose>${desgloseXml}
        </ver:Desglose>
        <ver:ImporteTotal>${invoice.total.toFixed(2)}</ver:ImporteTotal>
        <ver:HuellaHexSHA256>${hash}</ver:HuellaHexSHA256>
        <ver:SistemaInformatico>
          <ver:NombreSistema>Klima Verifactu Engine</ver:NombreSistema>
          <ver:IdSistema>KLIMA-V1.0</ver:IdSistema>
          <ver:Version>1.0.0</ver:Version>
          <ver:NumeroInstalacion>INST-001</ver:NumeroInstalacion>
        </ver:SistemaInformatico>
      </ver:RegistroFactura>
    </ver:RegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Construye el bloque XML del destinatario.
 *
 * Para operaciones nacionales: usa <NIF>.
 * Para intracomunitarias (cliente con VAT Number): usa <IDOtro> con
 * el código de país y el tipo de identificación 02 (NIF-IVA).
 */
function buildDestinatarioXml(invoice: Invoice): string {
  const name = escapeXml(invoice.clientName);

  if (invoice.esIntracomunitaria && invoice.clientVatNumber) {
    const vatNumber = invoice.clientVatNumber.toUpperCase();
    const codigoPais = vatNumber.substring(0, 2);
    const idNumber = vatNumber.substring(2);

    return `
          <ver:IDDestinatario>
            <ver:NombreRazon>${name}</ver:NombreRazon>
            <ver:IDOtro>
              <ver:CodigoPais>${escapeXml(codigoPais)}</ver:CodigoPais>
              <ver:IDType>02</ver:IDType>
              <ver:ID>${escapeXml(idNumber)}</ver:ID>
            </ver:IDOtro>
          </ver:IDDestinatario>`;
  }

  // Nacional: NIF español
  return `
          <ver:IDDestinatario>
            <ver:NombreRazon>${name}</ver:NombreRazon>
            <ver:NIF>${escapeXml(invoice.clientNif || '00000000T')}</ver:NIF>
          </ver:IDDestinatario>`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

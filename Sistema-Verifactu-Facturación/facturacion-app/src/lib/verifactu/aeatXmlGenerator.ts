/**
 * Generador de payloads SOAP XML cumpliendo con el Reglamento Veri*factu*
 * (Real Decreto 1007/2023 / Orden HAC/1177/2024 de la AEAT).
 */

import { Invoice, CompanySettings } from '@/lib/types';

export function generateVerifactuSoapXml(
  invoice: Invoice,
  companySettings: CompanySettings,
  environment: 'test' | 'production' = 'test'
): string {
  const isTest = environment === 'test';
  const issueDateFormatted = invoice.issueDate ? invoice.issueDate.split('-').reverse().join('-') : new Date().toLocaleDateString('es-ES');
  const hash = invoice.verifactu?.chainedHash || 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855';

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
        <ver:TipoFactura>F1</ver:TipoFactura>
        <ver:Destinatarios>
          <ver:IDDestinatario>
            <ver:NombreRazon>${escapeXml(invoice.clientName)}</ver:NombreRazon>
            <ver:NIF>${escapeXml(invoice.clientNif || '00000000T')}</ver:NIF>
          </ver:IDDestinatario>
        </ver:Destinatarios>
        <ver:Desglose>
          ${invoice.lineItems.map(l => `
          <ver:DetalleIVA>
            <ver:TipoImpositivo>${l.taxRate}</ver:TipoImpositivo>
            <ver:BaseImponible>${l.subtotal.toFixed(2)}</ver:BaseImponible>
            <ver:CuotaRepercutida>${l.taxAmount.toFixed(2)}</ver:CuotaRepercutida>
          </ver:DetalleIVA>`).join('')}
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

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * SII — SUMINISTRO INMEDIATO DE INFORMACIÓN
 *
 * El SII obliga a enviar los libros registro de IVA a la AEAT en un plazo
 * de 4 días naturales desde la emisión (o desde la recepción, en compras).
 * Es obligatorio para empresas con facturación anual superior a 6 millones
 * de euros, inscritas en el REDEME, o en régimen de grupo de IVA.
 *
 * Este módulo genera los XML SOAP que se envían a los webservices de la
 * AEAT y gestiona el estado de cada envío.
 *
 * ENDPOINTS DE LA AEAT (producción)
 * ─────────────────────────────────
 * Emitidas: https://www1.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV1SOAP
 * Recibidas: https://www1.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/fr/SiiFactFRV1SOAP
 *
 * ENDPOINTS DE PRUEBAS
 * ────────────────────
 * Emitidas: https://prewww1.aeat.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV1SOAP
 * Recibidas: https://prewww1.aeat.es/wlpl/SSII-FACT/ws/fr/SiiFactFRV1SOAP
 */

import type { Invoice, CompanySettings, ClaveRegimenIva, TipoFacturaFiscal } from './types';
import { resolverTipoFacturaFiscal, resolverClaveRegimenIva } from './constants';

// ============================================================
// TIPOS
// ============================================================

export type TipoLibroSii = 'emitidas' | 'recibidas';

export type EstadoEnvioSii = 'pendiente' | 'enviado' | 'aceptado' | 'aceptado_con_errores' | 'rechazado';

export interface SiiSubmission {
  id: string;
  invoiceIds: string[];
  tipoLibro: TipoLibroSii;
  xmlPayload?: string;
  aeatCsv?: string;
  aeatResponseBody?: string;
  submissionStatus: EstadoEnvioSii;
  submissionError?: string;
  submittedAt?: string;
  respondedAt?: string;
  createdAt: string;
  retryCount: number;
  lastRetryAt?: string;
}

export interface SiiConfig {
  activo: boolean;
  modo: 'test' | 'produccion';
  envioAutomatico: boolean;
}

export interface ResumenSii {
  pendientes: number;
  enviadas: number;
  aceptadas: number;
  rechazadas: number;
  diasHastaVencimiento: number | null; // null si no hay pendientes
}

// ============================================================
// CLAVES DE OPERACIÓN SII
// ============================================================

/**
 * Clave de régimen especial para el SII.
 *
 * Es lo mismo que la ClaveRegimenIva de Verifactu, pero el SII permite
 * hasta dos claves simultáneas en una misma factura. En la práctica,
 * la mayoría de facturas llevan solo una.
 */
export function claveOperacionSii(invoice: Invoice, settings: CompanySettings): ClaveRegimenIva {
  return resolverClaveRegimenIva(invoice, settings);
}

// ============================================================
// GENERADOR XML SII — LIBRO DE FACTURAS EMITIDAS
// ============================================================

export function generarXmlSiiEmitidas(
  invoices: Invoice[],
  settings: CompanySettings,
  modo: 'test' | 'produccion' = 'test',
): string {
  const registros = invoices.map(inv => {
    const tipoFactura = resolverTipoFacturaFiscal(inv);
    const claveRegimen = resolverClaveRegimenIva(inv, settings);
    const issueDateFormatted = formatDateSii(inv.issueDate);

    const destinatario = inv.esIntracomunitaria && inv.clientVatNumber
      ? buildIdOtroSii(inv.clientVatNumber, inv.clientName)
      : buildNifSii(inv.clientNif, inv.clientName);

    const desgloseIva = inv.taxBreakdown.map(tb =>
      `              <sii:DetalleIVA>
                <sii:TipoImpositivo>${tb.rate.toFixed(2)}</sii:TipoImpositivo>
                <sii:BaseImponible>${tb.base.toFixed(2)}</sii:BaseImponible>
                <sii:CuotaRepercutida>${tb.amount.toFixed(2)}</sii:CuotaRepercutida>
              </sii:DetalleIVA>`
    ).join('\n');

    const rectificativaXml = tipoFactura.startsWith('R') && inv.documentoOrigenNumber
      ? `
            <sii:FacturasRectificadas>
              <sii:IDFacturaRectificada>
                <sii:NumSerieFacturaEmisor>${escXml(inv.documentoOrigenNumber)}</sii:NumSerieFacturaEmisor>
                <sii:FechaExpedicionFacturaEmisor>${issueDateFormatted}</sii:FechaExpedicionFacturaEmisor>
              </sii:IDFacturaRectificada>
            </sii:FacturasRectificadas>
            <sii:TipoRectificativa>I</sii:TipoRectificativa>`
      : '';

    return `
          <sii:RegistroLRFacturasEmitidas>
            <sii:PeriodoLiquidacion>
              <sii:Ejercicio>${new Date(inv.issueDate).getFullYear()}</sii:Ejercicio>
              <sii:Periodo>${String(new Date(inv.issueDate).getMonth() + 1).padStart(2, '0')}</sii:Periodo>
            </sii:PeriodoLiquidacion>
            <sii:IDFactura>
              <sii:IDEmisorFactura>
                <sii:NIF>${escXml(settings.nif)}</sii:NIF>
              </sii:IDEmisorFactura>
              <sii:NumSerieFacturaEmisor>${escXml(inv.number)}</sii:NumSerieFacturaEmisor>
              <sii:FechaExpedicionFacturaEmisor>${issueDateFormatted}</sii:FechaExpedicionFacturaEmisor>
            </sii:IDFactura>
            <sii:FacturaExpedida>
              <sii:TipoFactura>${tipoFactura}</sii:TipoFactura>${rectificativaXml}
              <sii:ClaveRegimenEspecialOTrascendencia>${claveRegimen}</sii:ClaveRegimenEspecialOTrascendencia>
              <sii:ImporteTotal>${inv.total.toFixed(2)}</sii:ImporteTotal>
              <sii:DescripcionOperacion>${escXml(inv.notes || 'Prestación de servicios / Venta de bienes')}</sii:DescripcionOperacion>
              <sii:Contraparte>${destinatario}
              </sii:Contraparte>
              <sii:TipoDesglose>
                <sii:DesgloseFactura>
                  <sii:Sujeta>
                    <sii:NoExenta>
                      <sii:TipoNoExenta>S1</sii:TipoNoExenta>
                      <sii:DesgloseIVA>
${desgloseIva}
                      </sii:DesgloseIVA>
                    </sii:NoExenta>
                  </sii:Sujeta>
                </sii:DesgloseFactura>
              </sii:TipoDesglose>
            </sii:FacturaExpedida>
          </sii:RegistroLRFacturasEmitidas>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:sii="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/fact/ws/SuministroLR.xsd"
  xmlns:sii_lr="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/fact/ws/SuministroInformacion.xsd">
  <soapenv:Body>
    <sii_lr:SuministroLRFacturasEmitidas>
      <sii:Cabecera>
        <sii:IDVersionSii>1.1</sii:IDVersionSii>
        <sii:Titular>
          <sii:NombreRazon>${escXml(settings.businessName)}</sii:NombreRazon>
          <sii:NIF>${escXml(settings.nif)}</sii:NIF>
        </sii:Titular>
        <sii:TipoComunicacion>A0</sii:TipoComunicacion>
      </sii:Cabecera>${registros}
    </sii_lr:SuministroLRFacturasEmitidas>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// ============================================================
// GENERADOR XML SII — LIBRO DE FACTURAS RECIBIDAS
// ============================================================

export function generarXmlSiiRecibidas(
  invoices: Invoice[],
  settings: CompanySettings,
  modo: 'test' | 'produccion' = 'test',
): string {
  const registros = invoices.map(inv => {
    const tipoFactura = resolverTipoFacturaFiscal(inv);
    const claveRegimen = resolverClaveRegimenIva(inv, settings);
    const issueDateFormatted = formatDateSii(inv.issueDate);
    const fechaRegContable = formatDateSii(new Date().toISOString().substring(0, 10));

    const emisor = inv.esIntracomunitaria && inv.clientVatNumber
      ? buildIdOtroSii(inv.clientVatNumber, inv.clientName)
      : buildNifSii(inv.clientNif, inv.clientName);

    const desgloseIva = inv.taxBreakdown.map(tb =>
      `              <sii:DetalleIVA>
                <sii:TipoImpositivo>${tb.rate.toFixed(2)}</sii:TipoImpositivo>
                <sii:BaseImponible>${tb.base.toFixed(2)}</sii:BaseImponible>
                <sii:CuotaSoportada>${tb.amount.toFixed(2)}</sii:CuotaSoportada>
              </sii:DetalleIVA>`
    ).join('\n');

    return `
          <sii:RegistroLRFacturasRecibidas>
            <sii:PeriodoLiquidacion>
              <sii:Ejercicio>${new Date(inv.issueDate).getFullYear()}</sii:Ejercicio>
              <sii:Periodo>${String(new Date(inv.issueDate).getMonth() + 1).padStart(2, '0')}</sii:Periodo>
            </sii:PeriodoLiquidacion>
            <sii:IDFactura>
              <sii:IDEmisorFactura>${emisor}
              </sii:IDEmisorFactura>
              <sii:NumSerieFacturaEmisor>${escXml(inv.number)}</sii:NumSerieFacturaEmisor>
              <sii:FechaExpedicionFacturaEmisor>${issueDateFormatted}</sii:FechaExpedicionFacturaEmisor>
            </sii:IDFactura>
            <sii:FacturaRecibida>
              <sii:TipoFactura>${tipoFactura}</sii:TipoFactura>
              <sii:ClaveRegimenEspecialOTrascendencia>${claveRegimen}</sii:ClaveRegimenEspecialOTrascendencia>
              <sii:ImporteTotal>${inv.total.toFixed(2)}</sii:ImporteTotal>
              <sii:FechaRegContable>${fechaRegContable}</sii:FechaRegContable>
              <sii:DescripcionOperacion>${escXml(inv.notes || 'Compra de bienes / Recepción de servicios')}</sii:DescripcionOperacion>
              <sii:DesgloseFactura>
                <sii:DesgloseIVA>
${desgloseIva}
                </sii:DesgloseIVA>
              </sii:DesgloseFactura>
              <sii:Contraparte>${emisor}
              </sii:Contraparte>
            </sii:FacturaRecibida>
          </sii:RegistroLRFacturasRecibidas>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:sii="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/fact/ws/SuministroLR.xsd"
  xmlns:sii_lr="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/ssii/fact/ws/SuministroInformacion.xsd">
  <soapenv:Body>
    <sii_lr:SuministroLRFacturasRecibidas>
      <sii:Cabecera>
        <sii:IDVersionSii>1.1</sii:IDVersionSii>
        <sii:Titular>
          <sii:NombreRazon>${escXml(settings.businessName)}</sii:NombreRazon>
          <sii:NIF>${escXml(settings.nif)}</sii:NIF>
        </sii:Titular>
        <sii:TipoComunicacion>A0</sii:TipoComunicacion>
      </sii:Cabecera>${registros}
    </sii_lr:SuministroLRFacturasRecibidas>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// ============================================================
// RESUMEN Y ALERTAS
// ============================================================

/**
 * Resumen del estado SII de un conjunto de facturas.
 *
 * El dato más importante es `diasHastaVencimiento`: el plazo de 4 días
 * naturales desde la emisión de la factura más antigua sin enviar.
 * Si es negativo, ya se ha pasado el plazo (infracción).
 */
export function calcularResumenSii(invoices: Invoice[]): ResumenSii {
  let pendientes = 0;
  let enviadas = 0;
  let aceptadas = 0;
  let rechazadas = 0;
  let fechaMasAntigua: Date | null = null;

  for (const inv of invoices) {
    if (inv.tipo === 'presupuesto' || inv.tipo === 'pedido' || inv.tipo === 'albaran') continue;
    switch (inv.siiStatus) {
      case 'pendiente_sii':
        pendientes++;
        const fecha = new Date(inv.issueDate);
        if (!fechaMasAntigua || fecha < fechaMasAntigua) fechaMasAntigua = fecha;
        break;
      case 'enviado_sii':
        enviadas++;
        break;
      case 'aceptado_sii':
        aceptadas++;
        break;
      case 'rechazado_sii':
        rechazadas++;
        break;
    }
  }

  let diasHastaVencimiento: number | null = null;
  if (fechaMasAntigua) {
    const ahora = new Date();
    const plazo = new Date(fechaMasAntigua);
    plazo.setDate(plazo.getDate() + 4); // 4 días naturales
    diasHastaVencimiento = Math.ceil((plazo.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24));
  }

  return { pendientes, enviadas, aceptadas, rechazadas, diasHastaVencimiento };
}

/**
 * Facturas que deberían tener estado SII pero no lo tienen.
 *
 * Al activar el módulo SII, las facturas ya emitidas se marcan como
 * pendientes de envío. Esta función detecta las que faltan.
 */
export function facturasSinEstadoSii(invoices: Invoice[]): Invoice[] {
  return invoices.filter(inv =>
    inv.tipo !== 'presupuesto' &&
    inv.tipo !== 'pedido' &&
    inv.tipo !== 'albaran' &&
    inv.status !== 'borrador' &&
    inv.status !== 'anulada' &&
    !inv.siiStatus
  );
}

// ============================================================
// ENDPOINTS
// ============================================================

export const SII_ENDPOINTS = {
  test: {
    emitidas: 'https://prewww1.aeat.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV1SOAP',
    recibidas: 'https://prewww1.aeat.es/wlpl/SSII-FACT/ws/fr/SiiFactFRV1SOAP',
  },
  produccion: {
    emitidas: 'https://www1.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV1SOAP',
    recibidas: 'https://www1.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/fr/SiiFactFRV1SOAP',
  },
} as const;

// ============================================================
// HELPERS
// ============================================================

function formatDateSii(dateStr: string): string {
  // AEAT espera DD-MM-YYYY
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

function buildNifSii(nif: string, nombre: string): string {
  return `
                <sii:NombreRazon>${escXml(nombre)}</sii:NombreRazon>
                <sii:NIF>${escXml(nif || '00000000T')}</sii:NIF>`;
}

function buildIdOtroSii(vatNumber: string, nombre: string): string {
  const upper = vatNumber.toUpperCase();
  const codigoPais = upper.substring(0, 2);
  const id = upper.substring(2);
  return `
                <sii:NombreRazon>${escXml(nombre)}</sii:NombreRazon>
                <sii:IDOtro>
                  <sii:CodigoPais>${escXml(codigoPais)}</sii:CodigoPais>
                  <sii:IDType>02</sii:IDType>
                  <sii:ID>${escXml(id)}</sii:ID>
                </sii:IDOtro>`;
}

function escXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

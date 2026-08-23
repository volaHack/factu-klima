'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, Truck, ArrowLeft } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import LineasDocumento from '@/components/documentos/LineasDocumento';
import {
  getClients, getProducts, getCompanySettings, saveAlbaran, expedirAlbaran,
  saveCompanySettings, getLotes,
} from '@/lib/storage';
import {
  Client, Product, Albaran, AlbaranLineItem, CompanySettings, Lote,
} from '@/lib/types';
import { generateId, generateInvoiceNumber, sequenceFromNumber, getToday, formatCurrency, calculateInvoiceTotals } from '@/lib/utils';
import { getTaxLabel } from '@/lib/constants';
import { lineaVacia } from '@/lib/documentos';
import { tieneModulo } from '@/lib/modulos';
import { useToast } from '@/hooks/useToast';

export default function NuevoAlbaranPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  const [clientId, setClientId] = useState('');
  const [issueDate, setIssueDate] = useState(getToday());
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<AlbaranLineItem[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [modoLotes, setModoLotes] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, p, settings, loadedLotes] = await Promise.all([
        getClients(), getProducts(), getCompanySettings(), getLotes(),
      ]);
      setClients(c.filter(cl => cl.active));
      setProducts(p.filter(pr => pr.active));
      setSettings(settings);
      setLotes(loadedLotes);
      setModoLotes(tieneModulo(settings.modulos, 'lotes'));
      setLineItems([lineaVacia(settings)]);
      setMounted(true);
    })();
  }, []);

  const totals = useMemo(() => calculateInvoiceTotals(lineItems), [lineItems]);
  const selectedClient = clients.find(c => c.id === clientId);

  const handleSave = async (expedir: boolean) => {
    if (!clientId) {
      toastError('Error', 'Selecciona un cliente');
      return;
    }
    const validLines = lineItems.filter(l => l.productId && l.quantity > 0);
    if (validLines.length === 0) {
      toastError('Error', 'Añade al menos un producto');
      return;
    }

    const settings = await getCompanySettings();
    const number = generateInvoiceNumber(settings.albaranSeries || 'ALB', settings.nextAlbaranNumber || 1);
    const client = clients.find(c => c.id === clientId)!;

    const albaran: Albaran = {
      id: generateId(),
      number,
      series: settings.albaranSeries || 'ALB',
      clientId: client.id,
      clientName: client.tradeName || client.businessName,
      clientNif: client.nif,
      clientAddress: `${client.address}, ${client.postalCode} ${client.city}`,
      issueDate,
      status: 'borrador',
      lineItems: validLines,
      ...totals,
      notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      // saveAlbaran devuelve el albarán con el número final: si el número
      // propuesto ya existía (contador desincronizado), se re-numera solo.
      const saved = await saveAlbaran(albaran);
      settings.nextAlbaranNumber = sequenceFromNumber(saved.number) + 1;
      await saveCompanySettings(settings);

      if (expedir) {
        await expedirAlbaran(albaran.id);
        success('Albarán creado y expedido', `${saved.number} · stock descontado`);
      } else {
        success('Albarán guardado', `${saved.number} · queda en borrador`);
      }
      router.push('/albaranes');
    } catch (err) {
      toastError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) {
    return <PageSkeleton variant="form" label="Preparando el albarán" />;
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/albaranes" className="page-back">
            <ArrowLeft /> Albaranes
          </Link>
          <h1 className="page-title">Nuevo albarán</h1>
          <p className="page-subtitle">
            Prepara la entrega como borrador. Al expedirlo se descuenta el stock y queda listo para facturar.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => handleSave(false)}
            disabled={saving}
          >
            <Save size={16} /> Guardar borrador
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handleSave(true)}
            disabled={saving}
            title="Descuenta el stock de los productos y marca el albarán como entregado"
          >
            <Truck size={16} /> {saving ? 'Guardando…' : 'Guardar y expedir'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-6)', maxWidth: '900px' }}>
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Datos generales</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">Cliente</label>
              <select
                className="form-select"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
              >
                <option value="">-- Seleccionar cliente --</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.tradeName || c.businessName} ({c.nif})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Fecha del albarán</label>
              <input
                type="date"
                className="form-input"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
              />
            </div>
          </div>

          {selectedClient && (
            <div style={{
              marginTop: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)',
              background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
            }}>
              <strong style={{ color: 'var(--text-primary)' }}>{selectedClient.businessName}</strong>
              <br />{selectedClient.nif} · {selectedClient.address}, {selectedClient.postalCode} {selectedClient.city}
              <br />{selectedClient.email} · {selectedClient.phone}
            </div>
          )}
        </div>

        {/* Mismo editor que usa una factura nueva: es lo que trae los tres
            descuentos en cascada, el selector de lote y las unidades por
            bulto. Este albarán se puede convertir luego en factura, y una
            copia aparte del editor sólo se queda corta cuando eso pasa. */}
        {settings && (
          <LineasDocumento
            lineItems={lineItems}
            onChange={setLineItems}
            products={products}
            settings={settings}
            tarifaId={selectedClient?.tarifaId}
            lotes={modoLotes ? lotes : []}
          />
        )}

        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Totales</h3>
          <div className="invoice-totals">
            <div className="invoice-totals-table">
              <div className="invoice-totals-row">
                <span className="label">Base imponible</span>
                <span className="value">{formatCurrency(totals.subtotal)}</span>
              </div>
              {totals.totalDiscount > 0 && (
                <div className="invoice-totals-row">
                  <span className="label">Descuentos</span>
                  <span className="value" style={{ color: 'var(--color-danger)' }}>-{formatCurrency(totals.totalDiscount)}</span>
                </div>
              )}
              {totals.taxBreakdown.map(tb => (
                <div className="invoice-totals-row" key={tb.rate}>
                  <span className="label">{getTaxLabel(settings)} {tb.rate}% (base {formatCurrency(tb.base)})</span>
                  <span className="value">{formatCurrency(tb.amount)}</span>
                </div>
              ))}
              <div className="invoice-totals-row total">
                <span className="label">TOTAL</span>
                <span className="value">{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Observaciones</h3>
          <textarea
            className="form-textarea"
            placeholder="Notas que aparecerán en el albarán..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
          />
        </div>
      </div>
    </div>
  );
}

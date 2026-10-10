'use client';

// PÁGINA TEMPORAL DE PRUEBA — se borra antes del commit.
import dynamic from 'next/dynamic';
import { InvoiceStatus, type Invoice, type Product } from '@/lib/types';

const PanelAnalisis = dynamic(() => import('@/components/dashboard/PanelAnalisis'), { ssr: false });

function generar(): { invoices: Invoice[]; products: Product[] } {
  let semilla = 7;
  const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  const clientes = ['Bar Pepe', 'Hotel Atlántico', 'Supermercado Teide', 'Restaurante La Marea', 'Café Central', 'Panadería Sol'];
  const productos: Product[] = [
    ['Café', 'Bebidas'], ['Zumo natural', 'Bebidas'], ['Agua', 'Bebidas'], ['Tostada', 'Cocina'], ['Bocadillo', 'Cocina'],
    ['Ensalada', 'Cocina'], ['Croissant', 'Bollería'], ['Magdalena', 'Bollería'], ['Menú del día', 'Menús'], ['Tarta', 'Postres'],
  ].map(([name, category], i) => ({ id: `p${i}`, name, category } as Product));
  const hoy = new Date();
  const out: Invoice[] = [];
  for (let d = 400; d >= 0; d--) {
    const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - d);
    const n = azar() < 0.35 ? 0 : Math.floor(azar() * 4);
    for (let k = 0; k < n; k++) {
      const hora = 8 + Math.floor(azar() * 14);
      const creado = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), hora, Math.floor(azar() * 60));
      const iso = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
      const vence = new Date(dia.getTime() + 30 * 86400000);
      const venceIso = `${vence.getFullYear()}-${String(vence.getMonth() + 1).padStart(2, '0')}-${String(vence.getDate()).padStart(2, '0')}`;
      const lineas = Array.from({ length: 1 + Math.floor(azar() * 3) }, () => {
        const p = productos[Math.floor(azar() * azar() * productos.length)];
        const total = Math.round((20 + azar() * 180) * 100) / 100;
        return { id: `${p.id}-${k}`, productId: p.id, productName: p.name, quantity: 1, total };
      });
      const total = lineas.reduce((s, l) => s + l.total, 0);
      const pagada = d > 20 ? azar() < 0.85 : azar() < 0.3;
      const pagoDias = Math.floor(azar() * 55);
      const pago = new Date(dia.getTime() + pagoDias * 86400000);
      const pagoIso = `${pago.getFullYear()}-${String(pago.getMonth() + 1).padStart(2, '0')}-${String(pago.getDate()).padStart(2, '0')}`;
      out.push({
        id: `f${out.length}`, number: `F-${out.length + 1}`, series: 'F',
        clientId: `c${Math.floor(azar() * azar() * clientes.length)}`,
        clientName: '', issueDate: iso, dueDate: venceIso,
        paidDate: pagada ? pagoIso : undefined,
        status: pagada ? InvoiceStatus.PAGADA : d > 30 ? InvoiceStatus.VENCIDA : InvoiceStatus.PENDIENTE,
        lineItems: lineas, total, createdAt: creado.toISOString(),
      } as unknown as Invoice);
    }
  }
  for (const f of out) f.clientName = clientes[Number(f.clientId.slice(1))];
  return { invoices: out, products: productos };
}

const { invoices, products } = generar();
if (typeof document !== 'undefined') {
  const t = new URLSearchParams(location.search).get('tema') ?? 'light';
  document.documentElement.setAttribute('data-theme', t);
}

export default function Prueba() {
  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 16px 80px' }}>
      <PanelAnalisis invoices={invoices} products={products} />
    </main>
  );
}

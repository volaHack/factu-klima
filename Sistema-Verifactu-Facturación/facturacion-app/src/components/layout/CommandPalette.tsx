'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FileText, Users, Package, LayoutDashboard, Settings, BarChart3, X } from 'lucide-react';
import { getInvoices, getClients, getProducts } from '@/lib/storage';
import { Invoice, Client, Product } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (isOpen) {
      (async () => {
        setInvoices(await getInvoices());
        setClients(await getClients());
        setProducts(await getProducts());
      })();
    }
  }, [isOpen]);

  const results = useMemo(() => {
    if (!query) {
      return {
        pages: [
          { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
          { title: 'Ver Facturas', url: '/facturas', icon: FileText },
          { title: 'Crear Nueva factura', url: '/facturas/nueva', icon: FileText },
          { title: 'Clientes', url: '/clientes', icon: Users },
          { title: 'Productos', url: '/productos', icon: Package },
          { title: 'Informes', url: '/informes', icon: BarChart3 },
          { title: 'Ajustes', url: '/ajustes', icon: Settings },
        ],
        invoices: [],
        clients: [],
        products: [],
      };
    }

    const q = query.toLowerCase();
    const invs = invoices
      .filter(i => i.number.toLowerCase().includes(q) || i.clientName.toLowerCase().includes(q))
      .slice(0, 5);
    const cls = clients
      .filter(c => c.businessName.toLowerCase().includes(q) || c.tradeName.toLowerCase().includes(q) || c.nif.toLowerCase().includes(q))
      .slice(0, 4);
    const prods = products
      .filter(p => p.name.toLowerCase().includes(q) || p.ref.toLowerCase().includes(q))
      .slice(0, 4);

    return { pages: [], invoices: invs, clients: cls, products: prods };
  }, [query, invoices, clients, products]);

  if (!isOpen) return null;

  const navigateTo = (url: string) => {
    router.push(url);
    onClose();
    setQuery('');
  };

  return (
    <div className="cmd-palette-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={e => e.stopPropagation()}>
        <div className="cmd-palette-input">
          <Search size={18} style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            placeholder="Buscar facturas, clientes, productos o páginas..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="cmd-palette-results">
          {results.pages.length > 0 && (
            <div>
              <div className="cmd-palette-group-label">Acceso rápido</div>
              {results.pages.map(page => (
                <div key={page.url} className="cmd-palette-item" onClick={() => navigateTo(page.url)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <page.icon size={16} style={{ color: 'var(--accent-400)' }} />
                    <span>{page.title}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ir a página</span>
                </div>
              ))}
            </div>
          )}

          {results.invoices.length > 0 && (
            <div>
              <div className="cmd-palette-group-label">Facturas</div>
              {results.invoices.map(inv => (
                <div key={inv.id} className="cmd-palette-item" onClick={() => navigateTo(`/facturas/${inv.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileText size={16} style={{ color: 'var(--color-info)' }} />
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>{inv.number}</strong>
                      <span style={{ marginLeft: 8, color: 'var(--text-tertiary)' }}>{inv.clientName}</span>
                    </div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatCurrency(inv.total)}</span>
                </div>
              ))}
            </div>
          )}

          {results.clients.length > 0 && (
            <div>
              <div className="cmd-palette-group-label">Clientes</div>
              {results.clients.map(c => (
                <div key={c.id} className="cmd-palette-item" onClick={() => navigateTo(`/clientes/${c.id}`)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Users size={16} style={{ color: 'var(--color-success)' }} />
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>{c.tradeName || c.businessName}</strong>
                      <span style={{ marginLeft: 8, fontSize: '12px', color: 'var(--text-muted)' }}>{c.nif} · {c.city}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {results.products.length > 0 && (
            <div>
              <div className="cmd-palette-group-label">Productos</div>
              {results.products.map(p => (
                <div key={p.id} className="cmd-palette-item" onClick={() => navigateTo('/productos')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Package size={16} style={{ color: 'var(--color-warning)' }} />
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>[{p.ref}] {p.name}</strong>
                    </div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatCurrency(p.unitPrice)}</span>
                </div>
              ))}
            </div>
          )}

          {query && results.invoices.length === 0 && results.clients.length === 0 && results.products.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No se encontraron resultados para &quot;{query}&quot;
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

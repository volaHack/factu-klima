'use client';

import { Armchair } from 'lucide-react';
import { OpenCheck } from '@/lib/openChecks';
import { formatCurrency, calculateLineSubtotal, calculateLineTax } from '@/lib/utils';

interface TpvTablesProps {
  checks: OpenCheck[];
  onCreateCheck: (tableId: string) => void;
  onOpenCheck: (check: OpenCheck) => void;
}

export const TPV_TABLE_IDS = Array.from({ length: 12 }, (_, i) => `M-${String(i + 1).padStart(2, '0')}`);

export default function TpvTables({ checks, onCreateCheck, onOpenCheck }: TpvTablesProps) {
  const totalFor = (check: OpenCheck) =>
    check.lines.reduce((sum, l) => {
      const sub = calculateLineSubtotal(l.quantity, l.unitPrice, l.discountPercent);
      return sum + sub + calculateLineTax(sub, l.taxRate);
    }, 0);

  return (
    <section className="tpv-tables-area">
      <div className="tpv-tables-grid">
        {TPV_TABLE_IDS.map(id => {
          const check = checks.find(c => c.tableId === id);
          const occupied = !!check;
          return (
            <button
              key={id}
              className={`tpv-table ${occupied ? 'is-occupied' : ''}`}
              onClick={() => (occupied ? onOpenCheck(check) : onCreateCheck(id))}
            >
              <Armchair size={20} />
              <span className="tpv-table-id">{id}</span>
              {occupied ? (
                <span className="tpv-table-total">{formatCurrency(totalFor(check))}</span>
              ) : (
                <span className="tpv-table-free">Libre</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

'use client';

/**
 * Slider de porcentaje de impuesto (IVA/IGIC) de 0 a 99.
 * Sustituye a los selectores de tipos preconfigurados: el usuario decide
 * libremente qué impuesto cobrar en cada línea o producto.
 */
interface TaxRateSliderProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  /** Modo compacto para celdas de tabla (líneas de factura/albarán). */
  compact?: boolean;
}

export default function TaxRateSlider({ label, value, onChange, compact = false }: TaxRateSliderProps) {
  const v = Math.min(99, Math.max(0, Math.round(Number(value) || 0)));

  return (
    <div className={`tax-rate-slider ${compact ? 'compact' : ''}`}>
      {!compact && label && (
        <div className="tax-rate-slider-head">
          <span className="tax-rate-slider-label">{label}</span>
          <span className="tax-rate-slider-value">{v}%</span>
        </div>
      )}
      <div className="tax-rate-slider-control">
        <input
          type="range"
          min={0}
          max={99}
          step={1}
          value={v}
          onChange={e => onChange(Number(e.target.value))}
        />
        {compact && <span className="tax-rate-slider-value">{v}%</span>}
      </div>
    </div>
  );
}

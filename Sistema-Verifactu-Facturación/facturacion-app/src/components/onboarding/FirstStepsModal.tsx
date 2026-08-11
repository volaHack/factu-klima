'use client';

import { useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Info, ShieldCheck, X } from 'lucide-react';
import { getNifErrorDetails, formatNif } from '@/lib/validation/nif';
import TaxRateSlider from '@/components/ui/TaxRateSlider';

/**
 * Alta mínima obligatoria (NIF, razón social, domicilio fiscal).
 *
 * Estaba escrito con utilidades de Tailwind en un proyecto sin Tailwind.
 * El daño mayor estaba en la raíz: `fixed inset-0 bg-black/50 flex
 * items-center justify-center z-50` pretendía ser una capa a pantalla
 * completa, pero al no existir ninguna de esas clases el bloque caía en
 * el flujo normal del documento — es decir, el "modal" aparecía
 * empotrado dentro del dashboard, empujando los KPIs hacia abajo, con
 * los campos sin recuadro y los botones sin fondo. Ahora usa
 * `.modal-overlay` / `.modal`, que sí es una capa real.
 */

interface FirstStepsModalProps {
  onClose: () => void;
  onComplete: (data: FirstStepsData) => void;
  isDismissible?: boolean;
}

export interface FirstStepsData {
  nif: string;
  businessName: string;
  address: string;
  ivaTaxRate: string;
}

const TOTAL_STEPS = 2;

export function FirstStepsModal({ onClose, onComplete, isDismissible = true }: FirstStepsModalProps) {
  const [step, setStep] = useState(1);
  const [nif, setNif] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [ivaTaxRate, setIvaTaxRate] = useState<string>('21');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const nifError = nif ? getNifErrorDetails(nif) : { valid: true, type: 'UNKNOWN', message: '' };
  const nifTouched = nif.length > 0;

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {};
    if (!nif.trim()) newErrors.nif = 'Necesitamos tu NIF para poder emitir facturas';
    else if (!nifError.valid) newErrors.nif = nifError.message;
    if (!businessName.trim()) newErrors.businessName = 'Escribe el nombre legal de tu empresa';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors: Record<string, string> = {};
    if (!address.trim()) newErrors.address = 'El domicilio fiscal aparece en cada factura';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      onComplete({
        nif: nif.toUpperCase().replace(/[\s\-.]/g, ''),
        businessName,
        address,
        ivaTaxRate,
      });
    }
  };

  return (
    // Sólo se cierra pulsando fuera si el paso es descartable; si no, el
    // clic al vacío borraría un formulario a medio escribir.
    <div className="modal-overlay" onClick={isDismissible ? onClose : undefined}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-steps-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="page-eyebrow" style={{ marginBottom: 6 }}>
              Paso {step} de {TOTAL_STEPS}
            </p>
            <h2 className="modal-title" id="first-steps-title">
              {step === 1 ? 'Empecemos por tus datos fiscales' : 'Dónde tienes el domicilio fiscal'}
            </h2>
          </div>
          {isDismissible && (
            <button className="modal-close" onClick={onClose} aria-label="Cerrar">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Progreso: reutiliza el mismo relleno con degradado del acento
            que el resto del onboarding, en lugar de un texto suelto. */}
        <div className="onboarding-progress-bar" style={{ position: 'relative' }}>
          <div className="onboarding-progress-fill" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
        </div>

        <div className="modal-body stack">
          {step === 1 ? (
            <>
              <div className="form-group">
                <label className="form-label required" htmlFor="fs-nif">NIF, CIF o NIE</label>
                <div className="field-affix">
                  <input
                    id="fs-nif"
                    className={`form-input mono ${
                      errors.nif || (nifTouched && !nifError.valid)
                        ? 'is-invalid'
                        : nifTouched ? 'is-valid' : ''
                    }`}
                    type="text"
                    value={nif}
                    onChange={e => {
                      setNif(e.target.value.toUpperCase());
                      if (errors.nif) setErrors({ ...errors, nif: '' });
                    }}
                    placeholder="12345678Z o B12345678"
                    maxLength={20}
                    autoFocus
                    aria-invalid={nifTouched && !nifError.valid}
                  />
                  {nifTouched && (
                    <span className={`field-affix-icon ${nifError.valid ? 'is-valid' : 'is-invalid'}`}>
                      {nifError.valid ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    </span>
                  )}
                </div>
                {nifTouched && !nifError.valid && (
                  <p className="field-message is-error" role="alert">
                    <AlertCircle />{nifError.message}
                  </p>
                )}
                {nifTouched && nifError.valid && (
                  <p className="field-message is-success">
                    <CheckCircle2 />{nifError.type} válido · {formatNif(nif)}
                  </p>
                )}
                {!nifTouched && errors.nif && (
                  <p className="field-message is-error" role="alert"><AlertCircle />{errors.nif}</p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label required" htmlFor="fs-name">Razón social</label>
                <input
                  id="fs-name"
                  className={`form-input ${errors.businessName ? 'is-invalid' : ''}`}
                  type="text"
                  value={businessName}
                  onChange={e => {
                    setBusinessName(e.target.value);
                    if (errors.businessName) setErrors({ ...errors, businessName: '' });
                  }}
                  placeholder="El nombre legal, tal cual figura en la AEAT"
                  maxLength={100}
                />
                {errors.businessName && (
                  <p className="field-message is-error" role="alert"><AlertCircle />{errors.businessName}</p>
                )}
              </div>

              <div className="callout callout-info">
                <Info size={16} />
                <div>
                  <strong>Esto no se podrá cambiar más adelante</strong>
                  <p>
                    Estos dos datos identifican al emisor en todas tus facturas. En cuanto emitas la
                    primera quedan sellados junto a ella, así que conviene copiarlos exactamente como
                    los tienes registrados en la AEAT.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label required" htmlFor="fs-address">Domicilio fiscal</label>
                <input
                  id="fs-address"
                  className={`form-input ${errors.address ? 'is-invalid' : ''}`}
                  type="text"
                  value={address}
                  onChange={e => {
                    setAddress(e.target.value);
                    if (errors.address) setErrors({ ...errors, address: '' });
                  }}
                  placeholder="Calle, número, piso…"
                  maxLength={200}
                  autoFocus
                />
                {errors.address && (
                  <p className="field-message is-error" role="alert"><AlertCircle />{errors.address}</p>
                )}
              </div>

              <div className="form-group">
                <TaxRateSlider
                  label="IVA que aplicas normalmente (%)"
                  value={Number(ivaTaxRate)}
                  onChange={v => setIvaTaxRate(String(v))}
                />
                <span className="form-hint">
                  Se propone al crear productos nuevos. Puedes cambiarlo línea a línea al facturar.
                </span>
              </div>

              <div className="callout callout-success">
                <ShieldCheck size={16} />
                <div>
                  <strong>Con esto ya puedes facturar</strong>
                  <p>
                    El nombre comercial, el logotipo y el IBAN se rellenan cuando quieras desde Ajustes.
                    Para enviar facturas a la AEAT necesitarás además un certificado digital cualificado.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          {step > 1 ? (
            <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} /> Atrás
            </button>
          ) : <span />}
          <button className="btn btn-primary" onClick={handleNext}>
            {step === TOTAL_STEPS ? 'Guardar y empezar' : 'Continuar'}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

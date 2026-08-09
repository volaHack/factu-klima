'use client';

import { useEffect, useRef, useState } from 'react';
import { BarcodeAccumulator, isPrintableCharKey, isTextEditableTarget, SCANNER_MIN_LEN } from '@/lib/scanner';

interface UseBarcodeScannerOptions {
  onScan: (code: string) => void;
  disabled?: boolean;
}

export function useBarcodeScanner({ onScan, disabled = false }: UseBarcodeScannerOptions) {
  const [scanning, setScanning] = useState(false);
  const accRef = useRef(new BarcodeAccumulator());
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    if (disabled) return;

    const acc = accRef.current;

    const finishScan = (code: string): boolean => {
      setScanning(false);
      if (code.length < SCANNER_MIN_LEN) return false;
      onScanRef.current(code);
      return true;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEditableTarget(e.target)) return;

      if (e.key === 'Enter') {
        if (acc.isScanning) {
          const processed = finishScan(acc.flush());
          if (processed) e.preventDefault();
        }
        return;
      }

      if (isPrintableCharKey(e.key)) {
        acc.push(e.key, performance.now());
        setScanning(true);
      }
    };

    const tick = () => {
      if (acc.isScanning && acc.isIdleLongEnough(performance.now())) {
        finishScan(acc.flush());
      }
    };

    const intervalId = window.setInterval(tick, 100);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('keydown', handleKeyDown);
      acc.reset();
      setScanning(false);
    };
  }, [disabled]);

  return { scanning };
}

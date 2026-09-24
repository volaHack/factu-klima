'use client';

import { useEffect, useState } from 'react';
import { haceCuanto } from '@/lib/perfiles';
import { leerActividad, usePerfiles, type ApunteLeido } from '@/lib/perfilesCliente';

/**
 * «· emitida por Ana» junto a los datos de una factura, si la cuenta usa
 * perfiles y quedó apuntado quién la emitió. Si no, no pinta nada.
 */
export default function EmitidaPor({ documentoId }: { documentoId: string }) {
  const { disponible } = usePerfiles();
  const [apunte, setApunte] = useState<ApunteLeido | null>(null);

  useEffect(() => {
    if (!disponible) return;
    let vivo = true;
    void leerActividad({ documentoId, limite: 5 }).then(lista => {
      if (vivo) setApunte(lista.find(a => a.accion === 'factura_emitida') ?? null);
    });
    return () => { vivo = false; };
  }, [disponible, documentoId]);

  if (!apunte) return null;
  return (
    <span title={new Date(apunte.en).toLocaleString('es-ES')}>
      {' · '}emitida por <strong>{apunte.perfilNombre}</strong> {haceCuanto(apunte.en)}
    </span>
  );
}

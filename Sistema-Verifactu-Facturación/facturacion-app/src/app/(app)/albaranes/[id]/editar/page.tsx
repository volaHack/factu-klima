'use client';

import { useParams } from 'next/navigation';
import FormularioAlbaran from '@/components/albaranes/FormularioAlbaran';

/** Un albarán en borrador, abierto otra vez para corregirlo. */
export default function EditarAlbaranPage() {
  const { id } = useParams<{ id: string }>();
  return <FormularioAlbaran albaranId={id} />;
}

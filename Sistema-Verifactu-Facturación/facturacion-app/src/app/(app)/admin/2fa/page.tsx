import { redirect } from 'next/navigation';
import { verificarAdmin } from '@/lib/admin/dal';
import Verificacion2fa from '@/components/admin/Verificacion2fa';

export default async function Pagina2fa() {
  const { aal2 } = await verificarAdmin();
  if (aal2) redirect('/admin');
  return <Verificacion2fa />;
}

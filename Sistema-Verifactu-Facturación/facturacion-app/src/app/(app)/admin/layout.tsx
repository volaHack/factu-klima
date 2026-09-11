import Link from 'next/link';
import { verificarAdmin } from '@/lib/admin/dal';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await verificarAdmin();
  return (
    <div>
      <nav className="tab-bar" aria-label="Administración">
        <Link href="/admin" className="btn btn-ghost">Resumen</Link>
        <Link href="/admin/cuentas" className="btn btn-ghost">Cuentas</Link>
        <Link href="/admin/hacienda" className="btn btn-ghost">Hacienda</Link>
        <Link href="/admin/registro" className="btn btn-ghost">Registro</Link>
      </nav>
      {children}
    </div>
  );
}

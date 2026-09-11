import './admin.css';
import { verificarAdmin } from '@/lib/admin/dal';
import AdminNavBar from '@/components/admin/AdminNavBar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await verificarAdmin();
  return (
    <div className="admin-viewport">
      <AdminNavBar />
      {children}
    </div>
  );
}

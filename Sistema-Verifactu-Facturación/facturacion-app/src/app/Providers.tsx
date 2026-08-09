'use client';

import { ToastProvider } from '@/hooks/useToast';
import AuthWrapper from '@/components/AuthWrapper';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthWrapper>{children}</AuthWrapper>
    </ToastProvider>
  );
}

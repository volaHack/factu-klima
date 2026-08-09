import { Suspense } from 'react';
import ApprovalContent from './ApprovalContent';

export default function ApprovalPage() {
  return (
    <Suspense>
      <ApprovalContent />
    </Suspense>
  );
}

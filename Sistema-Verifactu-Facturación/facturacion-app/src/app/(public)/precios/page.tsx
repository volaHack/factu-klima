import { Suspense } from 'react';
import PricingContent from './PricingContent';

export default function PreciosPage() {
  return (
    <Suspense>
      <PricingContent />
    </Suspense>
  );
}

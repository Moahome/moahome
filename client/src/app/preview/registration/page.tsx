import { notFound } from 'next/navigation';
import { RegistrationPreviewPage } from '@/screens/registration-preview';

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <RegistrationPreviewPage />;
}

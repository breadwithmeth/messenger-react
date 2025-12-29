import { ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/model/authContext';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return <AuthProvider>{children}</AuthProvider>;
}

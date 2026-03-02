import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';

type ProtectedRouteProps = {
  children: ReactNode;
  requiredRoles?: string[];
};

function AccessDeniedPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        color: 'var(--text)',
        padding: 24,
      }}
    >
      <div
        style={{
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          borderRadius: 12,
          padding: '18px 20px',
          maxWidth: 480,
          width: '100%',
        }}
      >
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Доступ запрещён</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          У вас нет необходимых прав для просмотра этой страницы.
        </p>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, roles } = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          color: 'var(--text-muted)',
        }}
      >
        Загрузка...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && requiredRoles.length > 0) {
    const hasAnyRole = requiredRoles.some((role) => roles.includes(role));
    if (!hasAnyRole) {
      return <AccessDeniedPage />;
    }
  }

  return <>{children}</>;
}

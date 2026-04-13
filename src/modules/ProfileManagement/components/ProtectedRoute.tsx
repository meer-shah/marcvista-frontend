import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { authService } from "@/lib/auth";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    // Cookie is the source of truth — always verify with backend.
    // localStorage is only a cache; it may be empty on a new port or after
    // clearing storage even though the HttpOnly cookie is still valid.
    const checkAuth = async () => {
      const user = await authService.getCurrentUser();
      setIsAuthenticated(!!user);
    };

    checkAuth();
  }, []);

  // Show loading state while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login page with return url
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;

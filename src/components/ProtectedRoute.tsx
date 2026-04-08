import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Droplets } from "lucide-react";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Droplets className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

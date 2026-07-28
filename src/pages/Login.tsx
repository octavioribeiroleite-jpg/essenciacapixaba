import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Droplets } from "lucide-react";
import { toast } from "sonner";

function usernameToEmail(username: string) {
  const clean = username.trim().toLowerCase().replace(/\s+/g, ".");
  return `${clean}@essenciacapixaba.app`;
}

const FIXED_USERNAME = "ESSENCIA CAPIXABA";

export default function Login() {
  const { user, loading, signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Droplets className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const email = usernameToEmail(FIXED_USERNAME);

    if (isSignUp) {
      const { error } = await signUp(email, password);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Conta criada com sucesso!");
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error("Usuário ou senha incorretos.");
      }
    }
    setSubmitting(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      {/* Glow de fundo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[260px] w-[260px] rounded-full bg-primary/10 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-sm fade-in">
        {/* Marca */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 shadow-lg shadow-primary/10">
            <Droplets className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Essência Capixaba
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Gestão de perfumes & estoque
          </p>
        </div>

        {/* Card */}
        <Card className="border-border/60 bg-card/70 backdrop-blur-md shadow-2xl shadow-black/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium text-foreground text-center">
              {isSignUp ? "Criar conta" : "Bem-vinda de volta"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Senha</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="bg-secondary border-border h-11"
                />
              </div>
              <Button type="submit" className="w-full h-11" disabled={submitting}>
                {submitting ? "Aguarde..." : isSignUp ? "Criar Conta" : "Entrar"}
              </Button>
            </form>
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="mt-5 w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isSignUp ? "Já tem conta? Entre aqui" : "Não tem conta? Cadastre-se"}
            </button>
            <div className="mt-4 border-t border-border/60 pt-4 text-center">
              <Link
                to="/catalogo"
                className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
              >
                Ver catálogo público
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

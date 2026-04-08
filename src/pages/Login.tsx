import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-border/50">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Droplets className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-xl text-foreground">Essência Capixaba</CardTitle>
          <CardDescription className="text-muted-foreground">
            {isSignUp ? "Crie sua conta" : "Entre na sua conta"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Senha</label>
              <Input
                type="password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                
                className="bg-secondary border-border"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Aguarde..." : isSignUp ? "Criar Conta" : "Entrar"}
            </Button>
          </form>
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            {isSignUp ? "Já tem conta? Entre aqui" : "Não tem conta? Cadastre-se"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState } from "react";
import { PIX_KEY, PIX_KEY_TYPE, PIX_RECEIVER } from "@/lib/pix";
import { Button } from "@/components/ui/button";
import { Check, Copy, Wallet } from "lucide-react";
import { toast } from "sonner";

export default function PixCopy() {
  const [copied, setCopied] = useState(false);

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(PIX_KEY);
      setCopied(true);
      toast.success("Chave Pix copiada!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Toque e segure a chave para copiar");
    }
  };

  useEffect(() => {
    // tenta copiar automaticamente quando o usuário abre o link
    doCopy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(45_40%_96%)] via-background to-[hsl(40_30%_92%)] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-card rounded-3xl border border-primary/20 shadow-xl p-6 space-y-5 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary to-amber-600 flex items-center justify-center shadow-lg">
          <Wallet className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Chave Pix copiada!</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Abra o app do seu banco e cole no campo Pix.
          </p>
        </div>

        <div className="bg-secondary/60 border border-border rounded-xl p-4 text-left space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            {PIX_KEY_TYPE} · {PIX_RECEIVER}
          </p>
          <p className="font-mono text-sm break-all text-foreground select-all">{PIX_KEY}</p>
        </div>

        <Button onClick={doCopy} className="w-full h-12 text-base gap-2">
          {copied ? (
            <>
              <Check className="w-5 h-5" /> Copiado!
            </>
          ) : (
            <>
              <Copy className="w-5 h-5" /> Copiar chave Pix
            </>
          )}
        </Button>

        <p className="text-[11px] text-muted-foreground">
          Essência Capixaba — obrigada pela preferência!
        </p>
      </div>
    </div>
  );
}
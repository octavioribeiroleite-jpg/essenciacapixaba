import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Loader2, Sparkles, MessageCircle, RefreshCw } from "lucide-react";

export type ChargePayload = {
  customerName?: string | null;
  productName: string;
  brand?: string | null;
  quantity: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  paymentMethod: "cash" | "card" | "split" | string;
  dueDate?: string | null;
  firstDueDate?: string | null;
  firstPaid?: boolean;
  isOverdue?: boolean;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: ChargePayload | null;
}

export function ChargeMessageDialog({ open, onOpenChange, payload }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const generate = async () => {
    if (!payload) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-charge-message", {
        body: payload,
      });
      const msg = (data as any)?.message;
      if (msg) {
        setMessage(msg);
        if ((data as any)?.notice) toast.message((data as any).notice);
        return;
      }
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setMessage("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar mensagem");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && payload) {
      setMessage("");
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensagem copiada!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const openWhatsApp = () => {
    const text = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Mensagem de cobrança
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm">Gerando mensagem com IA...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[220px] text-sm leading-relaxed bg-secondary border-border"
            />
            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" onClick={generate} disabled={loading} className="gap-1">
                <RefreshCw className="w-3.5 h-3.5" /> Gerar
              </Button>
              <Button variant="secondary" onClick={copy} disabled={!message} className="gap-1">
                <Copy className="w-3.5 h-3.5" /> Copiar
              </Button>
              <Button onClick={openWhatsApp} disabled={!message} className="gap-1">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
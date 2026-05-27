import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Loader2, Sparkles, MessageCircle, RefreshCw } from "lucide-react";
import { FileText, Wallet } from "lucide-react";
import { generateReceiptPdf, type ReceiptItem } from "@/lib/receiptPdf";
import { PIX_KEY } from "@/lib/pix";

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
  /** Itens detalhados para o PDF (com imagens). Se ausente, PDF usa só o resumo. */
  items?: ReceiptItem[];
  /** ID do pedido/venda para referência no PDF */
  orderRef?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: ChargePayload | null;
}

export function ChargeMessageDialog({ open, onOpenChange, payload }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

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

  const copyPix = async () => {
    try {
      await navigator.clipboard.writeText(PIX_KEY);
      toast.success("Chave Pix copiada!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const downloadPdf = async () => {
    if (!payload) return;
    setPdfLoading(true);
    try {
      const items: ReceiptItem[] =
        payload.items && payload.items.length > 0
          ? payload.items
          : [
              {
                name: payload.productName,
                brand: payload.brand,
                qty: payload.quantity,
                total: payload.total,
                imageUrl: null,
              },
            ];
      await generateReceiptPdf({
        customerName: payload.customerName,
        items,
        total: payload.total,
        amountPaid: payload.amountPaid,
        amountDue: payload.amountDue,
        paymentMethod: payload.paymentMethod,
        dueDate: payload.dueDate,
        firstDueDate: payload.firstDueDate,
        firstPaid: payload.firstPaid,
        orderRef: payload.orderRef,
      });
      toast.success("PDF baixado!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Cobrança & Recibo
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm">Gerando mensagem...</p>
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
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border">
              <Button variant="outline" onClick={copyPix} className="gap-1">
                <Wallet className="w-3.5 h-3.5 text-primary" /> Copiar Pix
              </Button>
              <Button
                variant="outline"
                onClick={downloadPdf}
                disabled={pdfLoading}
                className="gap-1 border-primary/40"
              >
                {pdfLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-primary" />
                )}
                Baixar PDF
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
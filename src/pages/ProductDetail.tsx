import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, QrCode, Download, Trash2, Plus, ArrowUp, ArrowDown, Settings2, History } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { useState, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { logMovement, MOVEMENT_LABEL, type MovementType } from "@/lib/stockMovements";

const QUICK_SIZES = [3, 5, 10, 15];

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [qrOpen, setQrOpen] = useState(false);
  const [customMl, setCustomMl] = useState("");
  const [restockOpen, setRestockOpen] = useState(false);
  const [restockMl, setRestockMl] = useState("");
  const [restockNote, setRestockNote] = useState("");
  const qrRef = useRef<HTMLCanvasElement>(null);

  const { data: product } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!id,
  });

  const { data: sales } = useQuery({
    queryKey: ["product-sales", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("product_id", id!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!id,
  });

  const { data: movements } = useQuery({
    queryKey: ["product-movements", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*")
        .eq("product_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!id,
  });

  const restockMutation = useMutation({
    mutationFn: async () => {
      if (!product || !user) throw new Error("Erro");
      const add = parseFloat(restockMl);
      if (!add || add <= 0) throw new Error("Informe quantos ml adicionar");
      const newMl = Number(product.current_ml) + add;
      const { error } = await supabase
        .from("products")
        .update({ current_ml: newMl })
        .eq("id", product.id);
      if (error) throw error;
      await logMovement({
        userId: user.id,
        productId: product.id,
        type: "restock",
        mlChange: add,
        mlAfter: newMl,
        note: restockNote.trim() || "Reposição de estoque",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      queryClient.invalidateQueries({ queryKey: ["product-movements", id] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Entrada registrada!");
      setRestockOpen(false);
      setRestockMl("");
      setRestockNote("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const sellMutation = useMutation({
    mutationFn: async (ml: number) => {
      if (!product || !user) throw new Error("Erro");
      if (ml > Number(product.current_ml)) throw new Error("Estoque insuficiente!");

      const salePrice = ml * Number(product.sale_price_per_ml);
      const costPrice = ml * Number(product.cost_per_ml);

      const { data: saleRow, error: saleError } = await supabase
        .from("sales")
        .insert({
          user_id: user.id,
          product_id: product.id,
          ml_sold: ml,
          sale_price: salePrice,
          cost_price: costPrice,
        })
        .select("id")
        .single();
      if (saleError) throw saleError;

      const newMl = Number(product.current_ml) - ml;
      const { error: updateError } = await supabase
        .from("products")
        .update({ current_ml: newMl })
        .eq("id", product.id);
      if (updateError) throw updateError;

      await logMovement({
        userId: user.id,
        productId: product.id,
        type: "sale",
        mlChange: -ml,
        mlAfter: newMl,
        note: "Venda rápida (decant)",
        saleId: saleRow?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      queryClient.invalidateQueries({ queryKey: ["product-sales", id] });
      queryClient.invalidateQueries({ queryKey: ["product-movements", id] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales-month"] });
      toast.success("Venda registrada!");
      setCustomMl("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto excluído!");
      navigate("/products");
    },
  });

  const downloadQR = () => {
    const canvas = document.querySelector("#qr-canvas canvas") as HTMLCanvasElement;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${product?.name || "produto"}.png`;
    a.click();
  };

  const productUrl = `${window.location.origin}/products/${id}`;

  if (!product) {
    return <p className="text-center text-muted-foreground py-8">Carregando...</p>;
  }

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      {/* Product Info */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex gap-4">
            {product.image_url ? (
              <img src={product.image_url} alt={product.name} className="h-20 w-20 rounded-xl object-cover" />
            ) : (
              <div className="h-20 w-20 rounded-xl bg-secondary flex items-center justify-center text-3xl">🧴</div>
            )}
            <div className="flex-1">
              <h1 className="text-lg font-bold text-foreground">{product.name}</h1>
              <p className="text-sm text-muted-foreground">{product.brand || "Sem marca"}</p>
              <div className="mt-2 flex items-center gap-3">
                <span className={cn(
                  "text-lg font-bold",
                  Number(product.current_ml) < 10 ? "text-warning" : "text-primary"
                )}>
                  {Number(product.current_ml).toFixed(0)}ml
                </span>
                <span className="text-xs text-muted-foreground">/ {Number(product.total_ml)}ml</span>
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-secondary rounded-lg p-2">
                <span className="text-muted-foreground">Pago no frasco</span>
                <p className="font-medium text-foreground">
                  R$ {(Number(product.cost_per_ml) * Number(product.total_ml)).toFixed(2)}
                </p>
              </div>
              <div className="bg-secondary rounded-lg p-2">
                <span className="text-muted-foreground">Revenda do frasco</span>
                <p className="font-medium text-primary">
                  R$ {(Number(product.sale_price_per_ml) * Number(product.total_ml)).toFixed(2)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-secondary rounded-lg p-2">
                <span className="text-muted-foreground">Custo/ml</span>
                <p className="font-medium text-foreground">R$ {Number(product.cost_per_ml).toFixed(2)}</p>
              </div>
              <div className="bg-secondary rounded-lg p-2">
                <span className="text-muted-foreground">Venda/ml</span>
                <p className="font-medium text-primary">R$ {Number(product.sale_price_per_ml).toFixed(2)}</p>
              </div>
            </div>
            <div className="bg-secondary rounded-lg p-2 flex justify-between items-center">
              <span className="text-muted-foreground">Lucro/ml</span>
              <span className="font-bold text-success">
                R$ {(Number(product.sale_price_per_ml) - Number(product.cost_per_ml)).toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setQrOpen(true)}>
          <QrCode className="h-4 w-4 mr-1" /> Etiqueta Niimbot
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => setRestockOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Registrar entrada
        </Button>
        <Button
          variant="destructive"
          size="icon"
          onClick={() => {
            if (confirm("Excluir este produto?")) deleteMutation.mutate();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Quick Sale Buttons */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <h2 className="text-sm font-medium text-foreground mb-3">Venda Rápida</h2>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {QUICK_SIZES.map((ml) => (
              <Button
                key={ml}
                variant="secondary"
                className="text-sm font-bold"
                disabled={sellMutation.isPending || ml > Number(product.current_ml)}
                onClick={() => sellMutation.mutate(ml)}
              >
                -{ml}ml
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              step="0.1"
              min="0.1"
              max={Number(product.current_ml)}
              placeholder="ML personalizado"
              value={customMl}
              onChange={(e) => setCustomMl(e.target.value)}
              className="bg-secondary border-border"
            />
            <Button
              disabled={!customMl || sellMutation.isPending || parseFloat(customMl) > Number(product.current_ml)}
              onClick={() => sellMutation.mutate(parseFloat(customMl))}
            >
              Vender
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sales History */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">Histórico de Vendas</h2>
        {sales?.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma venda registrada.</p>}
        <div className="space-y-2">
          {sales?.map((sale) => (
            <Card key={sale.id} className="glass-card">
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">-{Number(sale.ml_sold)}ml</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(sale.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-primary">R$ {Number(sale.sale_price).toFixed(2)}</p>
                  <p className="text-xs text-success">
                    Lucro: R$ {(Number(sale.sale_price) - Number(sale.cost_price)).toFixed(2)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Stock movements history */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-primary" /> Histórico de movimentações
        </h2>
        {(!movements || movements.length === 0) && (
          <p className="text-xs text-muted-foreground">Nenhuma movimentação registrada.</p>
        )}
        <div className="space-y-2">
          {movements?.map((m: any) => {
            const change = Number(m.ml_change);
            const isIn = change >= 0;
            const Icon = m.type === "adjustment" ? Settings2 : isIn ? ArrowUp : ArrowDown;
            const color = m.type === "adjustment"
              ? "text-muted-foreground"
              : isIn
              ? "text-success"
              : "text-warning";
            return (
              <Card key={m.id} className="glass-card">
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={cn("h-4 w-4 shrink-0", color)} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {MOVEMENT_LABEL[m.type as MovementType]}
                        <span className={cn("ml-2 font-bold", color)}>
                          {isIn ? "+" : ""}
                          {change.toFixed(0)}ml
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        {m.note ? ` · ${m.note}` : ""}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">
                    Restou {Number(m.ml_after).toFixed(0)}ml
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Restock Dialog */}
      <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Registrar entrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Use ao reabastecer este perfume (compra de frasco novo, devolução etc).
              Estoque atual: <span className="text-foreground font-medium">{Number(product.current_ml).toFixed(0)}ml</span>
            </p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Quantidade a adicionar (ml) *</label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0.1"
                value={restockMl}
                onChange={(e) => setRestockMl(e.target.value)}
                className="bg-secondary border-border"
                placeholder="Ex: 100"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Observação</label>
              <Input
                value={restockNote}
                onChange={(e) => setRestockNote(e.target.value)}
                className="bg-secondary border-border"
                placeholder="Ex: Frasco novo AliExpress"
              />
            </div>
            <Button
              className="w-full"
              disabled={!restockMl || restockMutation.isPending}
              onClick={() => restockMutation.mutate()}
            >
              {restockMutation.isPending ? "Registrando..." : "Adicionar ao estoque"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-center text-foreground">Etiqueta QR Code</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <p className="text-xs text-muted-foreground text-center">{product.name}</p>
            <div id="qr-canvas" className="bg-background p-4 rounded-xl">
              <QRCodeCanvas
                value={productUrl}
                size={200}
                level="H"
                includeMargin
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>
            <Button onClick={downloadQR} className="w-full">
              <Download className="h-4 w-4 mr-2" /> Download PNG
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Salve e importe no app da Niimbot D110
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

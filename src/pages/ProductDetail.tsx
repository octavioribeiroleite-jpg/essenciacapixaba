import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, QrCode, Download, Trash2, Plus, ArrowUp, ArrowDown, Settings2, History, Pencil, Upload, Wind, Droplets, Clock, Waves, User as UserIcon, Info, Sparkles, CalendarClock } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import { useState, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { logMovement, MOVEMENT_LABEL, type MovementType } from "@/lib/stockMovements";
import { ML_PER_FRASCO, formatFrascos, perFrasco } from "@/lib/frascos";

const sillageToScore = (v?: string | null) => {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s.startsWith("suave") || s.startsWith("baix") || s.startsWith("intim")) return "1/4";
  if (s.startsWith("moder") || s.startsWith("méd") || s.startsWith("med")) return "2/4";
  if (s.startsWith("forte") || s.startsWith("alt")) return "3/4";
  if (s.startsWith("enorme") || s.startsWith("muito")) return "4/4";
  return v;
};

const longevityToScore = (v?: string | null) => {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s.startsWith("muito alt")) return "4/4";
  if (s.startsWith("alt")) return "3/4";
  if (s.startsWith("méd") || s.startsWith("med")) return "2/4";
  if (s.startsWith("baix")) return "1/4";
  return v;
};

const QUICK_QTYS = [1, 2, 3, 5];

const OCCASION_GROUPS: { label: string; items: string[] }[] = [
  { label: "Período do dia", items: ["Manhã", "Tarde", "Noite", "Qualquer hora"] },
  { label: "Clima", items: ["Quente", "Frio", "Neutro"] },
  {
    label: "Ocasião",
    items: [
      "Trabalho", "Casual", "Pós-banho", "Encontro", "Festa",
      "Formal", "Especial", "Presente", "Praia/Piscina",
    ],
  },
  {
    label: "Perfil",
    items: ["Jovem", "Clássico", "Moderno", "Maduro", "Romântico", "Marcante"],
  },
];
const MAX_OCCASIONS = 12;

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
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editTotalMl, setEditTotalMl] = useState("");
  const [editTotalCost, setEditTotalCost] = useState("");
  const [editTotalSale, setEditTotalSale] = useState("");
  const [editImage, setEditImage] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [dDescription, setDDescription] = useState("");
  const [dConcentration, setDConcentration] = useState("");
  const [dGender, setDGender] = useState("");
  const [dLongevity, setDLongevity] = useState("");
  const [dSillage, setDSillage] = useState("");
  const [dTop, setDTop] = useState("");
  const [dHeart, setDHeart] = useState("");
  const [dBase, setDBase] = useState("");
  const [dOccasions, setDOccasions] = useState<string[]>([]);
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
      const qty = Math.max(1, Math.floor(parseFloat(restockMl) || 0));
      if (!qty) throw new Error("Informe quantos frascos adicionar");
      const add = qty * ML_PER_FRASCO;
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
        note: restockNote.trim() || `Reposição: ${qty} frasco(s)`,
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
    mutationFn: async (qty: number) => {
      if (!product || !user) throw new Error("Erro");
      const ml = qty * ML_PER_FRASCO;
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
        note: `Venda rápida: ${qty} frasco(s)`,
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

  const openEdit = () => {
    if (!product) return;
    setEditName(product.name);
    setEditBrand(product.brand || "");
    setEditTotalMl(String(product.total_ml ?? ML_PER_FRASCO));
    setEditTotalCost(perFrasco(product.cost_per_ml).toFixed(2));
    setEditTotalSale(perFrasco(product.sale_price_per_ml).toFixed(2));
    setEditImage(null);
    setEditImagePreview(null);
    setEditOpen(true);
  };

  const aiImageMutation = useMutation({
    mutationFn: async () => {
      if (!product || !user) throw new Error("Erro");
      const { data, error } = await supabase.functions.invoke("fetch-perfume-image", {
        body: { productId: product.id, userId: user.id, name: product.name, brand: product.brand },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error("Imagem não encontrada");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Foto atualizada pela IA!");
      setPhotoOpen(false);
    },
    onError: (err: any) => toast.error(err.message || "IA não achou foto, envie manualmente"),
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!product || !user) throw new Error("Erro");
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("product-images").upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
      const { error } = await supabase
        .from("products")
        .update({ image_url: urlData.publicUrl })
        .eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Foto atualizada!");
      setPhotoOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const detailsMutation = useMutation({
    mutationFn: async () => {
      if (!product || !user) throw new Error("Erro");
      const { data, error } = await supabase.functions.invoke("fetch-perfume-details", {
        body: { productId: product.id, name: product.name, userId: user.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error("Não foi possível buscar as notas");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Notas e detalhes atualizados!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const generateDescriptionMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-description", {
        body: { product_id: id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Descrição gerada com sucesso!");
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao gerar descrição"),
   });

  const openDetails = () => {
    if (!product) return;
    const p: any = product;
    const rawNotes = (p.fragrance_notes ?? {}) as { top?: unknown; heart?: unknown; base?: unknown };
    const toStr = (v: unknown) =>
      Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : "";
    setDDescription(p.description ?? "");
    setDConcentration(p.concentration ?? "");
    setDGender(p.gender ?? "");
    setDLongevity(p.longevity ?? "");
    setDSillage(p.sillage ?? "");
    setDTop(toStr(rawNotes.top));
    setDHeart(toStr(rawNotes.heart));
    setDBase(toStr(rawNotes.base));
    setDOccasions(Array.isArray(p.occasions) ? p.occasions : []);
    setDetailsOpen(true);
  };

  const saveDetailsMutation = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("Erro");
      const toArr = (s: string) =>
        s.split(",").map((x) => x.trim()).filter(Boolean);
      const { error } = await supabase
        .from("products")
        .update({
          description: dDescription.trim() || null,
          concentration: dConcentration.trim() || null,
          gender: dGender || null,
          longevity: dLongevity || null,
          sillage: dSillage || null,
          fragrance_notes: {
            top: toArr(dTop),
            heart: toArr(dHeart),
            base: toArr(dBase),
          },
          occasions: dOccasions,
        })
        .eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Informações salvas!");
      setDetailsOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!product || !user) throw new Error("Erro");
      const ml = parseFloat(editTotalMl);
      const cost = parseFloat(editTotalCost) || 0;
      const sale = parseFloat(editTotalSale) || 0;
      if (!editName.trim()) throw new Error("Nome é obrigatório");
      if (!ml || ml <= 0) throw new Error("ML do frasco inválido");

      let image_url = product.image_url;
      if (editImage) {
        const ext = editImage.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("product-images")
          .upload(path, editImage);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
        image_url = urlData.publicUrl;
      }

      // Recalcula current_ml proporcionalmente quando o total muda
      const oldTotalMl = Number(product.total_ml) || ml;
      const ratio = oldTotalMl > 0 ? Number(product.current_ml) / oldTotalMl : 1;
      const newCurrentMl = Math.min(Math.round(ratio * ml), ml);

      const { error } = await supabase
        .from("products")
        .update({
          name: editName.trim(),
          brand: editBrand.trim() || null,
          total_ml: ml,
          current_ml: newCurrentMl,
          cost_per_ml: cost / ml,
          sale_price_per_ml: sale / ml,
          image_url,
        })
        .eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto atualizado!");
      setEditOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
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
    <div className="space-y-4 lg:max-w-5xl lg:mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      {/* Product Info */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <button
              onClick={() => setPhotoOpen(true)}
              className="h-20 w-20 rounded-xl overflow-hidden border border-border/60 hover:border-primary transition-colors relative group shrink-0"
              title="Trocar foto"
            >
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-secondary flex items-center justify-center text-3xl">🧴</div>
              )}
              <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Pencil className="h-4 w-4 text-white" />
              </span>
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-foreground">{product.name}</h1>
              <p className="text-sm text-muted-foreground">{product.brand || "Sem marca"}</p>
              <div className="mt-2 flex items-center gap-3">
                <span className={cn(
                  "text-lg font-bold",
                  Number(product.current_ml) < ML_PER_FRASCO * 2 ? "text-warning" : "text-primary"
                )}>
                  {formatFrascos(product.current_ml)} {Number(product.current_ml) === ML_PER_FRASCO ? "frasco" : "frascos"}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-secondary rounded-lg p-2">
                <span className="text-muted-foreground">Pago no frasco</span>
                <p className="font-medium text-foreground">
                  R$ {perFrasco(product.cost_per_ml).toFixed(2)}
                </p>
              </div>
              <div className="bg-secondary rounded-lg p-2">
                <span className="text-muted-foreground">Revenda do frasco</span>
                <p className="font-medium text-primary">
                  R$ {perFrasco(product.sale_price_per_ml).toFixed(2)}
                </p>
              </div>
            </div>
            <div className="bg-secondary rounded-lg p-2 flex justify-between items-center">
              <span className="text-muted-foreground">Lucro por frasco</span>
              <span className="font-bold text-success">
                R$ {(perFrasco(product.sale_price_per_ml) - perFrasco(product.cost_per_ml)).toFixed(2)}
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
        <Button variant="outline" size="icon" onClick={openEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="icon">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. <strong>{product.name}</strong> e todo o histórico
                de movimentações serão removidos permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate()}
                className="bg-destructive hover:bg-destructive/90"
              >
                Sim, excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Quick Sale Buttons */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <h2 className="text-sm font-medium text-foreground mb-3">Venda Rápida</h2>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_QTYS.map((qty) => {
              const maxQty = Math.floor(Number(product.current_ml) / ML_PER_FRASCO);
              return (
                <Button
                  key={qty}
                  variant="secondary"
                  className="text-sm font-bold"
                  disabled={sellMutation.isPending || qty > maxQty}
                  onClick={() => sellMutation.mutate(qty)}
                >
                  -{qty} {qty === 1 ? "frasco" : "frascos"}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Perfume details cards */}
      {(() => {
        const p: any = product;
        const toArr = (v: unknown): string[] => {
          if (Array.isArray(v)) return v.filter(Boolean).map(String);
          if (typeof v === "string" && v.trim())
            return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
          return [];
        };
        const rawNotes = (p?.fragrance_notes ?? null) as
          | { top?: unknown; heart?: unknown; base?: unknown }
          | null;
        const notes = rawNotes
          ? { top: toArr(rawNotes.top), heart: toArr(rawNotes.heart), base: toArr(rawNotes.base) }
          : null;
        const hasNotes =
          !!notes &&
          ((notes.top?.length ?? 0) + (notes.heart?.length ?? 0) + (notes.base?.length ?? 0) > 0);
        const hasSpecs = !!(p?.description || p?.concentration || p?.gender || p?.longevity || p?.sillage);
        return (
          <div className="space-y-3">
            <div className="bg-card rounded-2xl border border-border/60 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold">Sobre o Perfume</h3>
                </div>
                {p.description ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generateDescriptionMutation.mutate()}
                      disabled={generateDescriptionMutation.isPending}
                      className="gap-2 text-xs"
                    >
                      <Sparkles className="w-3 h-3" />
                      {generateDescriptionMutation.isPending ? "Gerando..." : "Regerar descrição"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-4 text-center border border-dashed border-border rounded-xl">
                    <Sparkles className="w-5 h-5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Nenhuma descrição ainda.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generateDescriptionMutation.mutate()}
                      disabled={generateDescriptionMutation.isPending}
                      className="gap-2 text-xs"
                    >
                      <Sparkles className="w-3 h-3" />
                      {generateDescriptionMutation.isPending ? "Gerando..." : "Gerar descrição IA"}
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {p.concentration && (
                    <div className="bg-secondary rounded-xl p-2.5 flex items-center gap-2">
                      <Droplets className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Concentração</p>
                        <p className="text-xs font-semibold">{p.concentration}</p>
                      </div>
                    </div>
                  )}
                  {(p as any).olfactory_family && (
                    <div className="bg-secondary rounded-xl p-2.5 flex items-center gap-2">
                      <Droplets className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Família olfativa</p>
                        <p className="text-xs font-semibold capitalize">{(p as any).olfactory_family}</p>
                      </div>
                    </div>
                  )}
                  {p.gender && (
                    <div className="bg-secondary rounded-xl p-2.5 flex items-center gap-2">
                      <UserIcon className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Gênero</p>
                        <p className="text-xs font-semibold">{p.gender}</p>
                      </div>
                    </div>
                  )}
                  {p.longevity && (
                    <div className="bg-secondary rounded-xl p-2.5 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Fixação</p>
                        <p className="text-xs font-semibold">{longevityToScore(p.longevity)}</p>
                      </div>
                    </div>
                  )}
                  {p.sillage && (
                    <div className="bg-secondary rounded-xl p-2.5 flex items-center gap-2">
                      <Waves className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Projeção</p>
                        <p className="text-xs font-semibold">{sillageToScore(p.sillage)}</p>
                      </div>
                    </div>
                  )}
                </div>
            </div>

            {hasNotes && (
              <div className="bg-card rounded-2xl border border-border/60 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Wind className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold">Notas Olfativas</h3>
                </div>
                {notes?.top && notes.top.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-2 h-2 rounded-full bg-yellow-400" />
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Notas de Topo</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {notes.top.map((n) => (
                        <span key={n} className="text-[11px] bg-yellow-50 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full">{n}</span>
                      ))}
                    </div>
                  </div>
                )}
                {notes?.heart && notes.heart.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-2 h-2 rounded-full bg-rose-400" />
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Notas de Coração</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {notes.heart.map((n) => (
                        <span key={n} className="text-[11px] bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">{n}</span>
                      ))}
                    </div>
                  </div>
                )}
                {notes?.base && notes.base.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-2 h-2 rounded-full bg-amber-700" />
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Notas de Base</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {notes.base.map((n) => (
                        <span key={n} className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">{n}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {Array.isArray(p.occasions) && p.occasions.length > 0 && (
              <div className="bg-card rounded-2xl border border-border/60 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold">Quando Usar</h3>
                </div>
                {OCCASION_GROUPS.map((g) => {
                  const selected = (p.occasions as string[]).filter((o) => g.items.includes(o));
                  if (selected.length === 0) return null;
                  return (
                    <div key={g.label}>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                        {g.label}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.map((o) => (
                          <span
                            key={o}
                            className="text-[11px] bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-full"
                          >
                            {o}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                disabled={detailsMutation.isPending}
                onClick={() => detailsMutation.mutate()}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {detailsMutation.isPending ? "Buscando..." : "IA"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                onClick={openDetails}
              >
                <Pencil className="w-3.5 h-3.5" />
                Editar manualmente
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Sales History */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">Histórico de Vendas</h2>
        {sales?.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma venda registrada.</p>}
        <div className="space-y-2">
          {sales?.map((sale) => (
            <Card key={sale.id} className="glass-card">
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">-{formatFrascos(sale.ml_sold)} frasco(s)</p>
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
                          {formatFrascos(Math.abs(change))} frasco(s)
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        {m.note ? ` · ${m.note}` : ""}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">
                    Restou {formatFrascos(m.ml_after)} frasco(s)
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
              Estoque atual: <span className="text-foreground font-medium">{formatFrascos(product.current_ml)} frasco(s)</span>
            </p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Quantidade de frascos a adicionar *</label>
              <Input
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                value={restockMl}
                onChange={(e) => setRestockMl(e.target.value)}
                className="bg-secondary border-border"
                placeholder="Ex: 2"
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

      {/* Edit Product Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Editar produto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome *</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Marca</label>
              <Input value={editBrand} onChange={(e) => setEditBrand(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">
                Tamanho do frasco: 100 ml (padrão). Estoque atual: {formatFrascos(product.current_ml)} frasco(s).
                Use "Registrar entrada" para alterar o estoque.
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Preço pago no frasco (R$)</label>
              <Input type="number" inputMode="decimal" step="0.01" min="0" value={editTotalCost} onChange={(e) => setEditTotalCost(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Preço de revenda do frasco (R$)</label>
              <Input type="number" inputMode="decimal" step="0.01" min="0" value={editTotalSale} onChange={(e) => setEditTotalSale(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Trocar foto</label>
              <label className="flex items-center justify-center gap-2 h-20 rounded-lg border-2 border-dashed border-border cursor-pointer hover:border-primary/50">
                {editImagePreview ? (
                  <img src={editImagePreview} alt="Preview" className="h-16 w-16 rounded-lg object-cover" />
                ) : product.image_url ? (
                  <img src={product.image_url} alt="Atual" className="h-16 w-16 rounded-lg object-cover opacity-70" />
                ) : (
                  <Upload className="h-5 w-5 text-muted-foreground" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setEditImage(f);
                      setEditImagePreview(URL.createObjectURL(f));
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>
            <Button className="w-full" disabled={editMutation.isPending} onClick={() => editMutation.mutate()}>
              {editMutation.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Trocar foto Dialog */}
      <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Trocar foto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Escolha como quer atualizar a foto deste perfume.
            </p>
            <Button
              className="w-full"
              disabled={aiImageMutation.isPending}
              onClick={() => aiImageMutation.mutate()}
            >
              {aiImageMutation.isPending ? "Buscando..." : "🔍 Buscar com IA"}
            </Button>
            <label className="flex items-center justify-center gap-2 h-12 rounded-lg border-2 border-dashed border-border cursor-pointer hover:border-primary/50 transition-colors">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {uploadPhotoMutation.isPending ? "Enviando..." : "Enviar do celular"}
              </span>
              <input
                type="file"
                accept="image/*"
                disabled={uploadPhotoMutation.isPending}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadPhotoMutation.mutate(f);
                }}
                className="hidden"
              />
            </label>
          </div>
        </DialogContent>
      </Dialog>

      {/* Editar detalhes manualmente */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Editar informações do perfume</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Descrição</label>
              <Textarea
                value={dDescription}
                onChange={(e) => setDDescription(e.target.value)}
                className="bg-secondary border-border min-h-[80px]"
                placeholder="Descrição comercial do perfume"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Concentração</label>
                <Input
                  value={dConcentration}
                  onChange={(e) => setDConcentration(e.target.value)}
                  className="bg-secondary border-border"
                  placeholder="EDP, EDT..."
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Gênero</label>
                <Select value={dGender} onValueChange={setDGender}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Masculino">Masculino</SelectItem>
                    <SelectItem value="Feminino">Feminino</SelectItem>
                    <SelectItem value="Unissex">Unissex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Fixação</label>
                <Select value={dLongevity} onValueChange={setDLongevity}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Baixa">1/4 — Baixa</SelectItem>
                    <SelectItem value="Média">2/4 — Média</SelectItem>
                    <SelectItem value="Alta">3/4 — Alta</SelectItem>
                    <SelectItem value="Muito Alta">4/4 — Muito Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Projeção</label>
                <Select value={dSillage} onValueChange={setDSillage}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Suave">1/4 — Suave</SelectItem>
                    <SelectItem value="Moderado">2/4 — Moderado</SelectItem>
                    <SelectItem value="Forte">3/4 — Forte</SelectItem>
                    <SelectItem value="Enorme">4/4 — Enorme</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Notas de topo <span className="opacity-60">(separadas por vírgula)</span>
              </label>
              <Input
                value={dTop}
                onChange={(e) => setDTop(e.target.value)}
                className="bg-secondary border-border"
                placeholder="Ex: Bergamota, Limão, Pera"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Notas de coração <span className="opacity-60">(separadas por vírgula)</span>
              </label>
              <Input
                value={dHeart}
                onChange={(e) => setDHeart(e.target.value)}
                className="bg-secondary border-border"
                placeholder="Ex: Rosa, Jasmim"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Notas de base <span className="opacity-60">(separadas por vírgula)</span>
              </label>
              <Input
                value={dBase}
                onChange={(e) => setDBase(e.target.value)}
                className="bg-secondary border-border"
                placeholder="Ex: Âmbar, Almíscar, Baunilha"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Quando usar</label>
                <span className="text-[10px] text-muted-foreground">
                  {dOccasions.length}/{MAX_OCCASIONS}
                </span>
              </div>
              {OCCASION_GROUPS.map((g) => (
                <div key={g.label} className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    {g.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.items.map((opt) => {
                      const active = dOccasions.includes(opt);
                      const atMax = dOccasions.length >= MAX_OCCASIONS && !active;
                      return (
                        <button
                          key={opt}
                          type="button"
                          disabled={atMax}
                          onClick={() =>
                            setDOccasions((prev) =>
                              prev.includes(opt)
                                ? prev.filter((x) => x !== opt)
                                : prev.length >= MAX_OCCASIONS
                                ? prev
                                : [...prev, opt]
                            )
                          }
                          className={cn(
                            "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-secondary text-muted-foreground border-border hover:border-primary/50",
                            atMax && "opacity-40 cursor-not-allowed"
                          )}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <Button
              className="w-full"
              disabled={saveDetailsMutation.isPending}
              onClick={() => saveDetailsMutation.mutate()}
            >
              {saveDetailsMutation.isPending ? "Salvando..." : "Salvar informações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

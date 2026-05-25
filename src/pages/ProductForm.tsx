import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Upload, Sparkles, Trash2, Loader2, Image as ImageIcon, FileText } from "lucide-react";
import { toast } from "sonner";
import { logMovement } from "@/lib/stockMovements";
import { ML_PER_FRASCO, normalizeName } from "@/lib/frascos";

const FIXED_PROFIT = 100; // R$ de lucro por frasco

const MARCAS_CONHECIDAS = [
  "Lattafa",
  "Armaf",
  "Al Haramain",
  "Rasasi",
  "Swiss Arabian",
  "Ajmal",
  "Maison Alhambra",
  "Fragrance World",
  "Afnan",
  "Zimaya",
];

async function fetchImageInBackground(productId: string, userId: string, name: string, brand: string | null) {
  try {
    await supabase.functions.invoke("fetch-perfume-image", {
      body: { productId, userId, name, brand },
    });
  } catch {
    // silencioso — produto fica sem foto
  }
}

async function fetchDetailsInBackground(productId: string, userId: string, name: string) {
  try {
    await supabase.functions.invoke("fetch-perfume-details", {
      body: { productId, userId, name },
    });
  } catch {
    // silencioso
  }
}

async function findExistingProduct(
  userId: string,
  name: string,
  brand: string | null | undefined,
) {
  const targetName = normalizeName(name);
  const rawBrand = normalizeName(brand);
  // trata "sem marca", "" e null como equivalentes
  const targetBrand = rawBrand === "sem marca" ? "" : rawBrand;
  if (!targetName) return null;
  const { data } = await supabase
    .from("products")
    .select("id, name, brand, current_ml")
    .eq("user_id", userId);
  if (!data) return null;
  return (
    data.find((p) => {
      const pName = normalizeName(p.name);
      const rawPBrand = normalizeName(p.brand);
      const pBrand = rawPBrand === "sem marca" ? "" : rawPBrand;
      return pName === targetName && pBrand === targetBrand;
    }) || null
  );
}

export default function ProductForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [qtyFrascos, setQtyFrascos] = useState("1");
  const [totalCost, setTotalCost] = useState("");
  const [totalSalePrice, setTotalSalePrice] = useState("");
  const [saleTouched, setSaleTouched] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Preço de venda automático = custo + R$ 100 (até o usuário editar manualmente)
  useEffect(() => {
    if (saleTouched) return;
    const c = parseFloat(totalCost);
    if (!isNaN(c) && c >= 0) {
      setTotalSalePrice((c + FIXED_PROFIT).toFixed(2));
    } else {
      setTotalSalePrice("");
    }
  }, [totalCost, saleTouched]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");

      let image_url: string | null = null;

      if (imageFile) {
        const ext = imageFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(path, imageFile);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(path);
        image_url = urlData.publicUrl;
      }

      const qty = Math.max(1, Math.floor(parseFloat(qtyFrascos) || 1));
      const ml = qty * ML_PER_FRASCO;
      const cost = parseFloat(totalCost) || 0;
      const sale = parseFloat(totalSalePrice) || 0;
      const costPerMl = cost / ML_PER_FRASCO;
      const salePerMl = sale / ML_PER_FRASCO;

      // dedup: se já existe produto com nome+marca (normalizado), faz restock
      const existing = await findExistingProduct(user.id, name, brand);
      if (existing) {
        const newCurrent = Number(existing.current_ml) + ml;
        const { error: uErr } = await supabase
          .from("products")
          .update({ current_ml: newCurrent })
          .eq("id", existing.id);
        if (uErr) throw uErr;
        await logMovement({
          userId: user.id,
          productId: existing.id,
          type: "restock",
          mlChange: ml,
          mlAfter: newCurrent,
          note: `+${qty} frasco(s) (duplicata detectada no cadastro)`,
        });
        return { merged: true, name: existing.name };
      }

      const { data: inserted, error } = await supabase
        .from("products")
        .insert({
          user_id: user.id,
          name: name.trim(),
          brand: brand.trim() || null,
          total_ml: ml,
          current_ml: ml,
          cost_per_ml: costPerMl,
          sale_price_per_ml: salePerMl,
          image_url,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (inserted) {
        await logMovement({
          userId: user.id,
          productId: inserted.id,
          type: "initial",
          mlChange: ml,
          mlAfter: ml,
          note: `Estoque inicial: ${qty} frasco(s)`,
        });
        if (!image_url) {
          fetchImageInBackground(inserted.id, user.id, name.trim(), brand.trim() || null);
        }
        fetchDetailsInBackground(inserted.id, user.id, name.trim());
      }
      return { merged: false };
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      if (res?.merged) toast.success(`Frascos somados ao estoque de "${res.name}"`);
      else toast.success("Produto cadastrado!");
      navigate("/products");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao cadastrar produto.");
    },
  });

  const qtyNum = Math.max(1, Math.floor(parseFloat(qtyFrascos) || 1));
  const costNum = parseFloat(totalCost) || 0;
  const saleNum = parseFloat(totalSalePrice) || 0;
  const profitPerFrasco = saleNum - costNum;

  // ===== AI batch import =====
  type DraftItem = {
    selected: boolean;
    name: string;
    brand: string;
    qty_frascos: string;
    total_cost: string;
    total_sale: string;
    saleTouched?: boolean;
  };
  const [aiImage, setAiImage] = useState<File | null>(null);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [aiText, setAiText] = useState("");

  const handleAiImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAiImage(file);
    setAiPreview(URL.createObjectURL(file));
    setDrafts([]);
  };

  const fileToBase64 = (file: File): Promise<{ data: string; mime: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const [meta, b64] = result.split(",");
        const mime = meta.match(/data:(.*?);/)?.[1] || file.type;
        resolve({ data: b64, mime });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!aiImage) throw new Error("Envie uma imagem");
      const { data: b64, mime } = await fileToBase64(aiImage);
      const { data, error } = await supabase.functions.invoke("parse-invoice", {
        body: { imageBase64: b64, mimeType: mime },
      });
      if (error) throw error;
      const items = (data?.items || []) as Array<{
        name?: string;
        brand?: string | null;
        total_ml?: number | null;
        total_cost?: number | null;
      }>;
      const newDrafts: DraftItem[] = items.map((it) => {
        const cost = it.total_cost ?? 0;
        return {
          selected: true,
          name: it.name || "",
          brand: it.brand || "",
          qty_frascos: "1",
          total_cost: cost ? cost.toFixed(2) : "",
          total_sale: cost ? (cost + FIXED_PROFIT).toFixed(2) : "",
        };
      });
      setDrafts(newDrafts);
      if (!newDrafts.length) toast.warning("Nenhum perfume identificado.");
      else toast.success(`${newDrafts.length} perfume(s) detectado(s).`);
    },
    onError: (err: any) => {
      const msg = err?.message || "Erro na análise";
      if (msg.includes("429")) toast.error("Limite de uso atingido. Tente novamente em instantes.");
      else if (msg.includes("402")) toast.error("Créditos de IA esgotados. Adicione créditos no workspace.");
      else toast.error(msg);
    },
  });

  const analyzeTextMutation = useMutation({
    mutationFn: async () => {
      if (!aiText.trim()) throw new Error("Cole o texto com os perfumes");
      const { data, error } = await supabase.functions.invoke("parse-invoice-text", {
        body: { text: aiText },
      });
      if (error) throw error;
      const items = (data?.items || []) as Array<{
        name?: string;
        brand?: string | null;
        total_ml?: number | null;
        total_cost?: number | null;
      }>;
      const newDrafts: DraftItem[] = items.map((it) => {
        const cost = it.total_cost ?? 0;
        return {
          selected: true,
          name: it.name || "",
          brand: it.brand || "",
          qty_frascos: "1",
          total_cost: cost ? cost.toFixed(2) : "",
          total_sale: cost ? (cost + FIXED_PROFIT).toFixed(2) : "",
        };
      });
      setDrafts(newDrafts);
      if (!newDrafts.length) toast.warning("Nenhum perfume identificado.");
      else toast.success(`${newDrafts.length} perfume(s) detectado(s).`);
    },
    onError: (err: any) => {
      const msg = err?.message || "Erro na análise";
      if (msg.includes("429")) toast.error("Limite de uso atingido. Tente novamente em instantes.");
      else if (msg.includes("402")) toast.error("Créditos de IA esgotados. Adicione créditos no workspace.");
      else toast.error(msg);
    },
  });

  const updateDraft = (idx: number, patch: Partial<DraftItem>) => {
    setDrafts((prev) =>
      prev.map((d, i) => {
        if (i !== idx) return d;
        const next = { ...d, ...patch };
        // se mexeu no custo e o usuário ainda não editou a venda → recalcula
        if (patch.total_cost !== undefined && !next.saleTouched) {
          const c = parseFloat(next.total_cost);
          next.total_sale = !isNaN(c) && c >= 0 ? (c + FIXED_PROFIT).toFixed(2) : "";
        }
        if (patch.total_sale !== undefined) {
          next.saleTouched = true;
        }
        return next;
      }),
    );
  };
  const removeDraft = (idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  const batchSaveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const valid = drafts.filter((d) => d.selected);
      if (!valid.length) throw new Error("Selecione ao menos um produto");
      let created = 0;
      let merged = 0;
      for (const d of valid) {
        if (!d.name.trim()) throw new Error("Cada item precisa de um nome");
        const qty = Math.max(1, Math.floor(parseFloat(d.qty_frascos) || 1));
        const ml = qty * ML_PER_FRASCO;
        const cost = parseFloat(d.total_cost) || 0;
        const sale = parseFloat(d.total_sale) || 0;

        const existing = await findExistingProduct(user.id, d.name, d.brand);
        if (existing) {
          const newCurrent = Number(existing.current_ml) + ml;
          const { error: uErr } = await supabase
            .from("products")
            .update({ current_ml: newCurrent })
            .eq("id", existing.id);
          if (uErr) throw uErr;
          await logMovement({
            userId: user.id,
            productId: existing.id,
            type: "restock",
            mlChange: ml,
            mlAfter: newCurrent,
            note: `+${qty} frasco(s) (duplicata detectada no cadastro IA)`,
          });
          merged++;
        } else {
          const { data: ins, error } = await supabase
            .from("products")
            .insert({
              user_id: user.id,
              name: d.name.trim(),
              brand: d.brand.trim() || null,
              total_ml: ml,
              current_ml: ml,
              cost_per_ml: cost / ML_PER_FRASCO,
              sale_price_per_ml: sale / ML_PER_FRASCO,
            })
            .select("id, name, brand")
            .single();
          if (error) throw error;
          if (ins) {
            await logMovement({
              userId: user.id,
              productId: ins.id,
              type: "initial",
              mlChange: ml,
              mlAfter: ml,
              note: `Estoque inicial: ${qty} frasco(s)`,
            });
            fetchImageInBackground(ins.id, user.id, ins.name, ins.brand);
            fetchDetailsInBackground(ins.id, user.id, ins.name);
          }
          created++;
        }
      }
      return { created, merged };
    },
    onSuccess: ({ created, merged }) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      const parts: string[] = [];
      if (created) parts.push(`${created} novo(s)`);
      if (merged) parts.push(`${merged} somado(s) ao estoque`);
      toast.success(parts.join(" · ") || "Concluído");
      navigate("/products");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      <Tabs defaultValue="manual" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-secondary">
          <TabsTrigger value="manual">Manual</TabsTrigger>
          <TabsTrigger value="ai" className="gap-1">
            <Sparkles className="h-3.5 w-3.5" /> Por IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="mt-4">
          <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Novo Frasco</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome do Perfume *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required className="bg-secondary border-border" placeholder="Ex: Dior Sauvage" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Marca</label>
              <Input
                list="marcas-list"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="bg-secondary border-border"
                placeholder="Ex: Lattafa"
              />
              <datalist id="marcas-list">
                {MARCAS_CONHECIDAS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Quantidade de Frascos *</label>
              <Input type="number" inputMode="numeric" step="1" min="1" value={qtyFrascos} onChange={(e) => setQtyFrascos(e.target.value)} required className="bg-secondary border-border" placeholder="1" />
              <p className="text-[10px] text-muted-foreground mt-1">
                Padrão: 1 frasco = 100 ml. Se já existir esse perfume, soma ao estoque atual.
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Preço Pago no Frasco (R$) *</label>
              <Input type="number" inputMode="decimal" step="0.01" min="0" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} required className="bg-secondary border-border" placeholder="Ex: 350,00" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block flex items-center justify-between">
                <span>Preço de Revenda do Frasco (R$) *</span>
                <span className="text-[10px] text-primary">Auto: custo + R$ {FIXED_PROFIT}</span>
              </label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={totalSalePrice}
                onChange={(e) => {
                  setSaleTouched(true);
                  setTotalSalePrice(e.target.value);
                }}
                required
                className="bg-secondary border-border"
                placeholder="Calculado automaticamente"
              />
            </div>

            {(costNum > 0 || saleNum > 0) && (
              <div className="rounded-lg bg-secondary/60 border border-border p-3 space-y-1.5">
                <p className="text-xs text-muted-foreground mb-1">Cálculo automático</p>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Custo do frasco</span>
                  <span className="font-medium text-foreground">R$ {costNum.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Venda do frasco</span>
                  <span className="font-medium text-primary">R$ {saleNum.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-border">
                  <span className="text-muted-foreground">Lucro por frasco · Total ({qtyNum})</span>
                  <span className="font-bold text-success">R$ {profitPerFrasco.toFixed(2)} · R$ {(profitPerFrasco * qtyNum).toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Image upload */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Foto do Frasco</label>
              <label className="flex items-center justify-center gap-2 h-24 rounded-lg border-2 border-dashed border-border cursor-pointer hover:border-primary/50 transition-colors">
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="h-20 w-20 rounded-lg object-cover" />
                ) : (
                  <div className="text-center">
                    <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                    <span className="text-xs text-muted-foreground">Toque para enviar</span>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              </label>
            </div>

            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando..." : "Cadastrar Produto"}
            </Button>
          </form>
        </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="mt-4 space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg text-foreground flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Cadastro com IA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Tabs defaultValue="photo" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-secondary">
                  <TabsTrigger value="photo" className="gap-1">
                    <ImageIcon className="h-3.5 w-3.5" /> Foto
                  </TabsTrigger>
                  <TabsTrigger value="text" className="gap-1">
                    <FileText className="h-3.5 w-3.5" /> Texto
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="photo" className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Envie a foto da nota fiscal, lista ou print do pedido. A IA identifica todos os perfumes de uma vez.
                  </p>
                  <label className="flex items-center justify-center gap-2 h-32 rounded-lg border-2 border-dashed border-border cursor-pointer hover:border-primary/50 transition-colors overflow-hidden">
                    {aiPreview ? (
                      <img src={aiPreview} alt="Preview" className="h-full w-full object-contain" />
                    ) : (
                      <div className="text-center">
                        <Upload className="h-7 w-7 text-muted-foreground mx-auto mb-1" />
                        <span className="text-xs text-muted-foreground">Toque para enviar foto</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" onChange={handleAiImage} className="hidden" />
                  </label>
                  <Button
                    className="w-full"
                    disabled={!aiImage || analyzeMutation.isPending}
                    onClick={() => analyzeMutation.mutate()}
                  >
                    {analyzeMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" /> Analisar Imagem</>
                    )}
                  </Button>
                </TabsContent>

                <TabsContent value="text" className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Cole a lista do pedido, mensagem do WhatsApp ou qualquer texto com os perfumes. A IA organiza tudo.
                  </p>
                  <Textarea
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    placeholder={"Ex:\n1. Dior Sauvage 100ml - R$ 350\n2. Bleu de Chanel 50ml - R$ 280\n3. Yara 100ml - R$ 180"}
                    className="bg-secondary border-border min-h-[140px] text-sm"
                  />
                  <Button
                    className="w-full"
                    disabled={!aiText.trim() || analyzeTextMutation.isPending}
                    onClick={() => analyzeTextMutation.mutate()}
                  >
                    {analyzeTextMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando...</>
                    ) : (
                      <><Sparkles className="h-4 w-4 mr-2" /> Analisar Texto</>
                    )}
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {drafts.length > 0 && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base text-foreground">
                  {drafts.filter((d) => d.selected).length} de {drafts.length} selecionados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {drafts.map((d, i) => {
                  const qty = Math.max(1, Math.floor(parseFloat(d.qty_frascos) || 1));
                  const cost = parseFloat(d.total_cost) || 0;
                  const sale = parseFloat(d.total_sale) || 0;
                  const profitFrasco = sale - cost;
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 space-y-2 transition-opacity ${d.selected ? "border-border" : "border-border/50 opacity-50"}`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={d.selected}
                          onChange={(e) => updateDraft(i, { selected: e.target.checked })}
                          className="h-4 w-4 accent-primary"
                        />
                        <Input
                          value={d.name}
                          onChange={(e) => updateDraft(i, { name: e.target.value })}
                          placeholder="Nome do perfume"
                          className="bg-secondary border-border h-8 text-sm flex-1"
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeDraft(i)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <Input
                        value={d.brand}
                        onChange={(e) => updateDraft(i, { brand: e.target.value })}
                        placeholder="Marca"
                        className="bg-secondary border-border h-8 text-xs"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Frascos</label>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            step="1"
                            value={d.qty_frascos}
                            onChange={(e) => updateDraft(i, { qty_frascos: e.target.value })}
                            className="bg-secondary border-border h-8 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Pago R$</label>
                          <Input
                            type="number"
                            inputMode="decimal"
                            value={d.total_cost}
                            onChange={(e) => updateDraft(i, { total_cost: e.target.value })}
                            className="bg-secondary border-border h-8 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Revenda R$</label>
                          <Input
                            type="number"
                            inputMode="decimal"
                            value={d.total_sale}
                            onChange={(e) => updateDraft(i, { total_sale: e.target.value })}
                            className="bg-secondary border-border h-8 text-xs"
                          />
                        </div>
                      </div>
                      {(cost > 0 || sale > 0) && (
                        <div className="text-[10px] text-muted-foreground flex justify-between">
                          <span>{qty} frasco(s)</span>
                          <span>Total custo: R$ {(cost * qty).toFixed(2)}</span>
                          <span className="text-success font-medium">Lucro/frasco: R$ {profitFrasco.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                <Button
                  className="w-full"
                  disabled={batchSaveMutation.isPending || !drafts.some((d) => d.selected)}
                  onClick={() => batchSaveMutation.mutate()}
                >
                  {batchSaveMutation.isPending
                    ? "Cadastrando..."
                    : `Cadastrar ${drafts.filter((d) => d.selected).length} produto(s)`}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

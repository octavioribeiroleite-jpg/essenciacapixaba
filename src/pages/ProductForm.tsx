import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Upload, Sparkles, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ProductForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [totalMl, setTotalMl] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [totalSalePrice, setTotalSalePrice] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

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

      const ml = parseFloat(totalMl);
      const cost = parseFloat(totalCost) || 0;
      const sale = parseFloat(totalSalePrice) || 0;
      const costPerMl = ml > 0 ? cost / ml : 0;
      const salePerMl = ml > 0 ? sale / ml : 0;
      const { error } = await supabase.from("products").insert({
        user_id: user.id,
        name: name.trim(),
        brand: brand.trim() || null,
        total_ml: ml,
        current_ml: ml,
        cost_per_ml: costPerMl,
        sale_price_per_ml: salePerMl,
        image_url,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto cadastrado!");
      navigate("/products");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao cadastrar produto.");
    },
  });

  const mlNum = parseFloat(totalMl) || 0;
  const costNum = parseFloat(totalCost) || 0;
  const saleNum = parseFloat(totalSalePrice) || 0;
  const costPerMl = mlNum > 0 ? costNum / mlNum : 0;
  const salePerMl = mlNum > 0 ? saleNum / mlNum : 0;
  const profitPerMl = salePerMl - costPerMl;

  // ===== AI batch import =====
  type DraftItem = {
    selected: boolean;
    name: string;
    brand: string;
    total_ml: string;
    total_cost: string;
    total_sale: string;
  };
  const [aiImage, setAiImage] = useState<File | null>(null);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);

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
          total_ml: it.total_ml ? String(it.total_ml) : "",
          total_cost: cost ? cost.toFixed(2) : "",
          total_sale: cost ? (cost * 2.3).toFixed(2) : "",
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
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };
  const removeDraft = (idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  const batchSaveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const valid = drafts.filter((d) => d.selected);
      if (!valid.length) throw new Error("Selecione ao menos um produto");
      const rows = valid.map((d) => {
        const ml = parseFloat(d.total_ml) || 0;
        const cost = parseFloat(d.total_cost) || 0;
        const sale = parseFloat(d.total_sale) || 0;
        if (!d.name.trim()) throw new Error("Cada item precisa de um nome");
        if (ml <= 0) throw new Error(`"${d.name}" precisa de ML do frasco`);
        return {
          user_id: user.id,
          name: d.name.trim(),
          brand: d.brand.trim() || null,
          total_ml: ml,
          current_ml: ml,
          cost_per_ml: cost / ml,
          sale_price_per_ml: sale / ml,
        };
      });
      const { error } = await supabase.from("products").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`${count} produto(s) cadastrado(s)!`);
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
            <Sparkles className="h-3.5 w-3.5" /> Por Foto (IA)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="mt-4">
          <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Novo Produto</CardTitle>
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
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} className="bg-secondary border-border" placeholder="Ex: Dior" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ML Total do Frasco *</label>
              <Input type="number" inputMode="decimal" step="0.1" min="0" value={totalMl} onChange={(e) => setTotalMl(e.target.value)} required className="bg-secondary border-border" placeholder="Ex: 100" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Preço Pago no Frasco (R$) *</label>
              <Input type="number" inputMode="decimal" step="0.01" min="0" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} required className="bg-secondary border-border" placeholder="Ex: 350,00" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Preço de Revenda do Frasco (R$) *</label>
              <Input type="number" inputMode="decimal" step="0.01" min="0" value={totalSalePrice} onChange={(e) => setTotalSalePrice(e.target.value)} required className="bg-secondary border-border" placeholder="Ex: 800,00" />
            </div>

            {mlNum > 0 && (
              <div className="rounded-lg bg-secondary/60 border border-border p-3 space-y-1.5">
                <p className="text-xs text-muted-foreground mb-1">Cálculo automático</p>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Custo por ml</span>
                  <span className="font-medium text-foreground">R$ {costPerMl.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Venda por ml</span>
                  <span className="font-medium text-primary">R$ {salePerMl.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-border">
                  <span className="text-muted-foreground">Lucro por ml</span>
                  <span className="font-bold text-success">R$ {profitPerMl.toFixed(2)}</span>
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
                <Sparkles className="h-5 w-5 text-primary" /> Cadastro por Foto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
                  const ml = parseFloat(d.total_ml) || 0;
                  const cost = parseFloat(d.total_cost) || 0;
                  const sale = parseFloat(d.total_sale) || 0;
                  const profitMl = ml > 0 ? (sale - cost) / ml : 0;
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
                          <label className="text-[10px] text-muted-foreground block mb-0.5">ML</label>
                          <Input
                            type="number"
                            inputMode="decimal"
                            value={d.total_ml}
                            onChange={(e) => updateDraft(i, { total_ml: e.target.value })}
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
                      {ml > 0 && (
                        <div className="text-[10px] text-muted-foreground flex justify-between">
                          <span>Custo/ml: R$ {(cost / ml).toFixed(2)}</span>
                          <span>Venda/ml: R$ {(sale / ml).toFixed(2)}</span>
                          <span className="text-success font-medium">Lucro/ml: R$ {profitMl.toFixed(2)}</span>
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

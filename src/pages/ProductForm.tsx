import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Upload } from "lucide-react";
import { toast } from "sonner";

export default function ProductForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [totalMl, setTotalMl] = useState("");
  const [costPerMl, setCostPerMl] = useState("");
  const [salePricePerMl, setSalePricePerMl] = useState("");
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
      const { error } = await supabase.from("products").insert({
        user_id: user.id,
        name: name.trim(),
        brand: brand.trim() || null,
        total_ml: ml,
        current_ml: ml,
        cost_per_ml: parseFloat(costPerMl) || 0,
        sale_price_per_ml: parseFloat(salePricePerMl) || 0,
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

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

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
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">ML Total *</label>
                <Input type="number" step="0.1" min="0" value={totalMl} onChange={(e) => setTotalMl(e.target.value)} required className="bg-secondary border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Custo/ml</label>
                <Input type="number" step="0.01" min="0" value={costPerMl} onChange={(e) => setCostPerMl(e.target.value)} className="bg-secondary border-border" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Venda/ml</label>
                <Input type="number" step="0.01" min="0" value={salePricePerMl} onChange={(e) => setSalePricePerMl(e.target.value)} className="bg-secondary border-border" />
              </div>
            </div>

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
    </div>
  );
}

import { useState } from "react";
import { Sparkles, X, Loader2, Star, Search, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";

const publicSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const ML_PER_FRASCO = 100;

type Product = {
  id: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  sale_price_per_ml: number;
  current_ml: number;
  olfactory_family: string | null;
  gender: string | null;
  similarity_score?: number;
  fragrance_notes?: { top?: string[]; heart?: string[]; base?: string[] } | null;
  occasions?: string[] | null;
  sillage?: string | null;
};

type QuizStep = {
  question: string;
  emoji: string;
  options: { label: string; value: string }[];
  key: string;
};

const QUIZ_STEPS: QuizStep[] = [
  {
    key: "gender",
    emoji: "👤",
    question: "Para quem é o perfume?",
    options: [
      { label: "Para mim (Masculino)", value: "Masculino" },
      { label: "Para mim (Feminino)", value: "Feminino" },
      { label: "Unissex / Qualquer", value: "Unissex" },
    ],
  },
  {
    key: "mood",
    emoji: "🌡️",
    question: "Qual sensação você quer transmitir?",
    options: [
      { label: "🍬 Doce e envolvente", value: "gourmand" },
      { label: "🌸 Floral e delicado", value: "floral" },
      { label: "🌲 Amadeirado e marcante", value: "amadeirado" },
      { label: "🌊 Fresco e leve", value: "fresco" },
      { label: "🔥 Oriental e sedutor", value: "oriental" },
    ],
  },
  {
    key: "occasion",
    emoji: "📍",
    question: "Para qual ocasião?",
    options: [
      { label: "💼 Trabalho / Dia a dia", value: "Trabalho" },
      { label: "💑 Encontro romântico", value: "Encontro" },
      { label: "🎉 Festa / Balada", value: "Festa" },
      { label: "🏖️ Casual / Praia", value: "Casual" },
      { label: "🎁 Presente especial", value: "Especial" },
    ],
  },
  {
    key: "intensity",
    emoji: "💨",
    question: "Prefere algo mais...",
    options: [
      { label: "🌿 Leve e discreto", value: "leve" },
      { label: "⚖️ Equilibrado", value: "moderado" },
      { label: "💥 Marcante e duradouro", value: "forte" },
    ],
  },
];

const FAMILY_MAP: Record<string, string[]> = {
  gourmand: ["gourmand", "oriental doce", "baunilha", "doce"],
  floral: ["floral", "floral frutado", "floral aquático", "floral verde"],
  amadeirado: ["amadeirado", "amadeirado especiado", "woody", "oud"],
  fresco: ["fresco", "aquático", "cítrico", "aromático"],
  oriental: ["oriental", "oriental especiado", "âmbar", "especiado"],
};

export default function FragranceDiscovery({
  products,
  onSelectProduct,
}: {
  products: Product[];
  onSelectProduct: (p: Product) => void;
}) {
  const [mode, setMode] = useState<null | "quiz" | "similar" | "import">(null);
  const [quizStep, setQuizStep] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizResults, setQuizResults] = useState<Product[]>([]);
  const [similarQuery, setSimilarQuery] = useState("");
  const [similarPickerOpen, setSimilarPickerOpen] = useState(false);
  const [similarPickerSearch, setSimilarPickerSearch] = useState("");
  const [selectedRef, setSelectedRef] = useState<Product | null>(null);
  const [similarResults, setSimilarResults] = useState<Product[]>([]);
  const [importQuery, setImportQuery] = useState("");
  const [importResults, setImportResults] = useState<Product[]>([]);
  const [importProfile, setImportProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const priceFrasco = (p: Product) =>
    Math.ceil((p.sale_price_per_ml * ML_PER_FRASCO) / 10) * 10;

  const reset = () => {
    setMode(null);
    setQuizStep(0);
    setQuizAnswers({});
    setQuizResults([]);
    setSimilarQuery("");
    setSimilarPickerOpen(false);
    setSimilarPickerSearch("");
    setSelectedRef(null);
    setSimilarResults([]);
    setImportQuery("");
    setImportResults([]);
    setImportProfile(null);
  };

  const calcQuizResults = (answers: Record<string, string>) => {
    const families = FAMILY_MAP[answers.mood] || [];
    const scored = products.map((p) => {
      let score = 0;
      if (answers.gender && (p.gender === answers.gender || p.gender === "Unissex")) score += 30;
      const fam = (p.olfactory_family || "").toLowerCase();
      if (families.some((f) => fam.includes(f))) score += 40;
      if (answers.occasion && p.occasions?.includes(answers.occasion)) score += 20;
      const sillage = (p.sillage || "").toLowerCase();
      if (answers.intensity === "leve" && (sillage.includes("suave") || sillage.includes("moderado"))) score += 10;
      if (answers.intensity === "moderado" && sillage.includes("moderado")) score += 10;
      if (answers.intensity === "forte" && (sillage.includes("forte") || sillage.includes("enorme"))) score += 10;
      return { ...p, similarity_score: score };
    });
    return scored
      .filter((p) => (p.similarity_score ?? 0) > 0 && p.current_ml > 0)
      .sort((a, b) => (b.similarity_score ?? 0) - (a.similarity_score ?? 0))
      .slice(0, 5);
  };

  const handleQuizAnswer = (key: string, value: string) => {
    const newAnswers = { ...quizAnswers, [key]: value };
    setQuizAnswers(newAnswers);
    if (quizStep < QUIZ_STEPS.length - 1) {
      setQuizStep(quizStep + 1);
    } else {
      setQuizResults(calcQuizResults(newAnswers));
    }
  };

  const runSimilarSearch = (ref: Product) => {
    const refNotes = [
      ...(ref.fragrance_notes?.top || []),
      ...(ref.fragrance_notes?.heart || []),
      ...(ref.fragrance_notes?.base || []),
    ].map((n) => n.toLowerCase());

    const scored = products
      .filter((p) => p.id !== ref.id)
      .map((p) => {
        let score = 0;
        const pNotes = [
          ...(p.fragrance_notes?.top || []),
          ...(p.fragrance_notes?.heart || []),
          ...(p.fragrance_notes?.base || []),
        ].map((n) => n.toLowerCase());

        if (ref.olfactory_family && p.olfactory_family) {
          if (ref.olfactory_family === p.olfactory_family) score += 40;
          else if (ref.olfactory_family.split(" ")[0] === p.olfactory_family.split(" ")[0]) score += 20;
        }
        if (ref.gender && (p.gender === ref.gender || p.gender === "Unissex")) score += 15;
        for (const note of refNotes) {
          if (pNotes.some((pn) => pn.includes(note) || note.includes(pn))) score += 5;
        }
        return { ...p, similarity_score: score };
      })
      .filter((p) => (p.similarity_score ?? 0) > 0)
      .sort((a, b) => {
        // disponíveis primeiro
        const aIn = a.current_ml > 0 ? 1 : 0;
        const bIn = b.current_ml > 0 ? 1 : 0;
        if (aIn !== bIn) return bIn - aIn;
        return (b.similarity_score ?? 0) - (a.similarity_score ?? 0);
      })
      .slice(0, 6);

    setSimilarResults(scored);
    if (scored.length === 0) toast.info("Nenhum similar encontrado no estoque atual.");
  };

  const pickerProducts = () => {
    const q = similarPickerSearch.trim().toLowerCase();
    const filtered = products.filter((p) => {
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.brand || "").toLowerCase().includes(q) ||
        (p.olfactory_family || "").toLowerCase().includes(q)
      );
    });
    return filtered.sort((a, b) => {
      const aIn = a.current_ml > 0 ? 1 : 0;
      const bIn = b.current_ml > 0 ? 1 : 0;
      if (aIn !== bIn) return bIn - aIn;
      return a.name.localeCompare(b.name);
    });
  };

  const handleImportSearch = async () => {
    if (!importQuery.trim()) return;
    setLoading(true);
    setImportResults([]);
    setImportProfile(null);
    try {
      const { data, error } = await publicSupabase.functions.invoke("find-similar-perfumes", {
        body: { perfumeName: importQuery },
      });
      if (error || !data?.ok) {
        if (data?.error === "low_confidence") {
          toast.warning("Não consegui identificar esse perfume com certeza. Tente o nome completo.");
        } else if (data?.error === "no_credits") {
          toast.error(data.message || "Créditos da IA esgotados.");
        } else if (data?.error === "rate_limit") {
          toast.warning(data.message || "Muitas buscas. Aguarde alguns segundos.");
        } else {
          toast.error("Erro ao buscar. Tente novamente.");
        }
        return;
      }
      setImportProfile(data.profile);
      setImportResults(data.similar || []);
      if ((data.similar || []).length === 0) toast.info("Nenhum similar encontrado no estoque atual.");
    } catch {
      toast.error("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  };

  const ResultCard = ({ p }: { p: Product }) => (
    <button
      onClick={() => onSelectProduct(p)}
      className="flex items-center gap-3 w-full bg-card border border-border rounded-2xl p-3 hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
    >
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0 text-lg font-bold text-primary overflow-hidden">
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} className="w-12 h-12 rounded-xl object-cover" />
        ) : (
          p.name.charAt(0)
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground truncate">{p.name}</p>
        <p className="text-xs text-muted-foreground">{p.brand || "Sem marca"}</p>
        {p.olfactory_family && (
          <p className="text-xs text-primary/80 mt-0.5">{p.olfactory_family}</p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-foreground">R$ {priceFrasco(p)}</p>
        {p.similarity_score !== undefined && (
          <div className="flex items-center gap-0.5 justify-end mt-0.5">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span className="text-xs text-muted-foreground">{Math.min(100, p.similarity_score)}%</span>
          </div>
        )}
      </div>
    </button>
  );

  return (
    <div className="mb-6">
      {!mode && (
        <div className="bg-gradient-to-br from-primary/10 via-card to-primary/5 border border-primary/20 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-base text-foreground">Encontre sua fragrância perfeita</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Descubra perfumes do nosso catálogo que combinam com você
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setMode("quiz")}
              className="flex flex-col items-center gap-2 bg-card border border-border rounded-xl p-3 hover:border-primary hover:bg-primary/5 transition-all"
            >
              <span className="text-2xl">🧭</span>
              <span className="text-xs font-semibold text-center leading-tight">Fazer o Quiz</span>
              <span className="text-[10px] text-muted-foreground text-center">Responda 4 perguntas</span>
            </button>
            <button
              onClick={() => setMode("similar")}
              className="flex flex-col items-center gap-2 bg-card border border-border rounded-xl p-3 hover:border-primary hover:bg-primary/5 transition-all"
            >
              <span className="text-2xl">🔗</span>
              <span className="text-xs font-semibold text-center leading-tight">Buscar Similar</span>
              <span className="text-[10px] text-muted-foreground text-center">Escolha um do catálogo</span>
            </button>
            <button
              onClick={() => setMode("import")}
              className="flex flex-col items-center gap-2 bg-card border border-border rounded-xl p-3 hover:border-primary hover:bg-primary/5 transition-all"
            >
              <span className="text-2xl">🌍</span>
              <span className="text-xs font-semibold text-center leading-tight">Importado</span>
              <span className="text-[10px] text-muted-foreground text-center">Digite qualquer perfume</span>
            </button>
          </div>
        </div>
      )}

      {mode === "quiz" && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm">🧭 Encontre seu Perfume</h3>
            <button onClick={reset} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {quizResults.length === 0 ? (
            <>
              <div className="flex gap-1 mb-4">
                {QUIZ_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${i <= quizStep ? "bg-primary" : "bg-muted"}`}
                  />
                ))}
              </div>
              <p className="text-2xl mb-1">{QUIZ_STEPS[quizStep].emoji}</p>
              <p className="font-semibold text-sm mb-3">{QUIZ_STEPS[quizStep].question}</p>
              <div className="flex flex-col gap-2">
                {QUIZ_STEPS[quizStep].options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleQuizAnswer(QUIZ_STEPS[quizStep].key, opt.value)}
                    className="text-left px-4 py-3 rounded-xl border border-border bg-muted/30 hover:border-primary hover:bg-primary/5 text-sm font-medium transition-all"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold mb-3">✨ Perfumes ideais para você:</p>
              <div className="flex flex-col gap-2">
                {quizResults.map((p) => (
                  <ResultCard key={p.id} p={p} />
                ))}
              </div>
              <button
                onClick={() => {
                  setQuizStep(0);
                  setQuizAnswers({});
                  setQuizResults([]);
                }}
                className="mt-3 text-xs text-primary underline"
              >
                Refazer quiz
              </button>
            </>
          )}
        </div>
      )}

      {mode === "similar" && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm">🔗 Buscar Similar</h3>
            <button onClick={reset} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Escolha um perfume do nosso catálogo para encontrar opções com perfil parecido
          </p>
          <button
            onClick={() => setSimilarPickerOpen(true)}
            className="w-full flex items-center gap-3 bg-muted/40 border border-border rounded-xl px-3 py-3 text-left hover:border-primary transition-all mb-3"
          >
            {selectedRef ? (
              <>
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {selectedRef.image_url ? (
                    <img src={selectedRef.image_url} alt="" className="w-10 h-10 object-cover rounded-lg" />
                  ) : (
                    <span className="text-sm font-bold text-primary">{selectedRef.name.charAt(0)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{selectedRef.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {selectedRef.brand || "Sem marca"} · trocar
                  </p>
                </div>
              </>
            ) : (
              <>
                <Search className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground flex-1">Selecionar perfume do catálogo</span>
              </>
            )}
          </button>

          {similarResults.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                Perfumes similares a <strong>{selectedRef?.name}</strong>:
              </p>
              <div className="flex flex-col gap-2">
                {similarResults.map((p) => (
                  <ResultCard key={p.id} p={p} />
                ))}
              </div>
            </>
          )}

          {similarPickerOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in"
              onClick={() => setSimilarPickerOpen(false)}
            >
              <div
                className="bg-card w-full sm:max-w-md max-h-[85vh] rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl flex flex-col animate-in slide-in-from-bottom"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-border flex items-center justify-between flex-shrink-0">
                  <h3 className="font-bold text-sm">Escolha um perfume</h3>
                  <button
                    onClick={() => setSimilarPickerOpen(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-3 border-b border-border flex-shrink-0">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      autoFocus
                      placeholder="Buscar nome, marca ou família..."
                      value={similarPickerSearch}
                      onChange={(e) => setSimilarPickerSearch(e.target.value)}
                      className="pl-9 rounded-xl text-sm"
                    />
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 p-2">
                  {(() => {
                    const list = pickerProducts();
                    const inStock = list.filter((p) => p.current_ml > 0);
                    const out = list.filter((p) => p.current_ml <= 0);
                    return (
                      <>
                        {inStock.length > 0 && (
                          <p className="text-[10px] font-bold text-emerald-700 uppercase px-2 py-1.5">
                            Disponíveis ({inStock.length})
                          </p>
                        )}
                        {inStock.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setSelectedRef(p);
                              setSimilarPickerOpen(false);
                              runSimilarSearch(p);
                            }}
                            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted text-left"
                          >
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {p.image_url ? (
                                <img src={p.image_url} alt="" className="w-10 h-10 object-cover rounded-lg" />
                              ) : (
                                <span className="text-sm font-bold text-primary">{p.name.charAt(0)}</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{p.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {p.brand || "Sem marca"}
                                {p.olfactory_family ? ` · ${p.olfactory_family}` : ""}
                              </p>
                            </div>
                            {selectedRef?.id === p.id && <Check className="w-4 h-4 text-primary" />}
                          </button>
                        ))}
                        {out.length > 0 && (
                          <p className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1.5 mt-2">
                            Sob encomenda ({out.length})
                          </p>
                        )}
                        {out.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setSelectedRef(p);
                              setSimilarPickerOpen(false);
                              runSimilarSearch(p);
                            }}
                            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted text-left opacity-70"
                          >
                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {p.image_url ? (
                                <img src={p.image_url} alt="" className="w-10 h-10 object-cover rounded-lg" />
                              ) : (
                                <span className="text-sm font-bold text-muted-foreground">{p.name.charAt(0)}</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{p.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {p.brand || "Sem marca"}
                                {p.olfactory_family ? ` · ${p.olfactory_family}` : ""}
                              </p>
                            </div>
                          </button>
                        ))}
                        {list.length === 0 && (
                          <p className="text-center text-sm text-muted-foreground py-8">
                            Nenhum perfume encontrado
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "import" && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm">🌍 Buscar por Importado</h3>
            <button onClick={reset} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Digite qualquer perfume (Dior Sauvage, Chanel N°5...) e a IA encontra o mais parecido no nosso catálogo
          </p>
          <div className="flex gap-2 mb-3">
            <Input
              placeholder="Ex: Dior Sauvage, Bleu de Chanel..."
              value={importQuery}
              onChange={(e) => setImportQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleImportSearch()}
              className="flex-1 rounded-xl text-sm"
            />
            <button
              onClick={handleImportSearch}
              disabled={loading}
              className="bg-primary text-primary-foreground px-4 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-1"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? "" : "IA"}
            </button>
          </div>

          {importProfile && (
            <div className="bg-muted/40 rounded-xl p-3 mb-3 text-xs">
              <p className="font-semibold mb-1">📊 Perfil identificado:</p>
              <div className="flex flex-wrap gap-1">
                {importProfile.olfactory_family && (
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {importProfile.olfactory_family}
                  </span>
                )}
                {importProfile.gender && (
                  <span className="bg-muted border border-border px-2 py-0.5 rounded-full">
                    {importProfile.gender}
                  </span>
                )}
                {importProfile.longevity && (
                  <span className="bg-muted border border-border px-2 py-0.5 rounded-full">
                    Fixação: {importProfile.longevity}
                  </span>
                )}
                {[
                  ...(importProfile.fragrance_notes?.top || []),
                  ...(importProfile.fragrance_notes?.base || []),
                ]
                  .slice(0, 4)
                  .map((n: string) => (
                    <span
                      key={n}
                      className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full"
                    >
                      {n}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {importResults.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                Similares a <strong>{importQuery}</strong> no nosso catálogo:
              </p>
              <div className="flex flex-col gap-2">
                {importResults.map((p) => (
                  <ResultCard key={p.id} p={p} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
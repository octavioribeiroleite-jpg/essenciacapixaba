import { Classification } from "@/lib/productClassification";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ClassificationDot({
  c,
  size = "md",
}: {
  c?: Classification;
  size?: "sm" | "md";
}) {
  if (!c) return null;
  const dim = size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-block ${dim} rounded-full ring-2 ring-white shadow-sm ${c.color}`}
          aria-label={c.label}
        />
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        <p className="font-semibold">{c.label}</p>
        <p className="text-muted-foreground">
          {c.salesCount} {c.salesCount === 1 ? "frasco vendido" : "frascos vendidos"} em 60 dias
        </p>
        <p className="text-muted-foreground italic">{c.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
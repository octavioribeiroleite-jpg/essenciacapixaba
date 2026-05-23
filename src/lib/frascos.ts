// Helpers para o padrão "1 frasco = 100 ml"
export const ML_PER_FRASCO = 100;

export function mlToFrascos(ml: number | string): number {
  const n = Number(ml) || 0;
  return n / ML_PER_FRASCO;
}

export function frascosToMl(frascos: number | string): number {
  return (Number(frascos) || 0) * ML_PER_FRASCO;
}

export function formatFrascos(ml: number | string): string {
  const f = mlToFrascos(ml);
  return Number.isInteger(f) ? `${f}` : f.toFixed(1);
}

/** Lucro/preço/custo do frasco a partir do valor por ml */
export function perFrasco(perMl: number | string): number {
  return (Number(perMl) || 0) * ML_PER_FRASCO;
}

/** Normaliza nome para detectar duplicatas (lowercase, sem acento, sem espaços extras) */
export function normalizeName(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

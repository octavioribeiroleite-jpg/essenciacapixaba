import jsPDF from "jspdf";
import QRCode from "qrcode";
import { PIX_KEY, PIX_KEY_TYPE, PIX_RECEIVER } from "./pix";

export interface ReceiptItem {
  name: string;
  brand?: string | null;
  qty: number;
  total: number;
  imageUrl?: string | null;
}

export interface ReceiptPayload {
  customerName?: string | null;
  items: ReceiptItem[];
  total: number;
  amountPaid: number;
  amountDue: number;
  paymentMethod: "cash" | "card" | "split" | string;
  dueDate?: string | null;
  firstDueDate?: string | null;
  firstPaid?: boolean;
  orderRef?: string;
}

const PRIMARY: [number, number, number] = [156, 124, 56]; // dourado
const TEXT: [number, number, number] = [40, 35, 28];
const MUTED: [number, number, number] = [120, 115, 105];
const BORDER: [number, number, number] = [230, 222, 205];
const SOFT_BG: [number, number, number] = [250, 246, 236];

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  // Tenta via <img crossOrigin> + canvas (funciona com Supabase Storage que envia CORS *)
  const viaImage = () =>
    new Promise<string | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const size = 256;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          // fundo branco p/ JPEG
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, size, size);
          // cover/contain
          const ratio = Math.min(size / img.width, size / img.height);
          const w = img.width * ratio;
          const h = img.height * ratio;
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });

  try {
    const fromImg = await viaImage();
    if (fromImg) return fromImg;
    // Fallback: fetch direto
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function brl(n: number) {
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function formatDate(d?: string | null) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function paymentDescription(p: ReceiptPayload): string[] {
  const lines: string[] = [];
  if (p.paymentMethod === "split") {
    const half = Math.round((p.total / 2) * 100) / 100;
    lines.push("Pagamento: 50% entrada + 50% em até 30 dias");
    lines.push(
      `  1ª parcela: ${brl(half)} — ${p.firstPaid ? "paga" : `pendente${p.firstDueDate ? ` (vence ${formatDate(p.firstDueDate)})` : ""}`}`,
    );
    lines.push(
      `  2ª parcela: ${brl(half)} — ${p.amountDue <= 0 ? "paga" : `pendente${p.dueDate ? ` (vence ${formatDate(p.dueDate)})` : ""}`}`,
    );
  } else {
    const label = p.paymentMethod === "card" ? "Cartão" : "Dinheiro";
    if (p.amountDue <= 0) {
      lines.push(`Pagamento: ${label} — pago`);
    } else {
      lines.push(
        `Pagamento: ${label} — pendente${p.dueDate ? ` (vence ${formatDate(p.dueDate)})` : ""}`,
      );
      lines.push(`  Pago: ${brl(p.amountPaid)} · Restante: ${brl(p.amountDue)}`);
    }
  }
  return lines;
}

export async function generateReceiptPdf(payload: ReceiptPayload): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  let y = M;

  // ---------- Header ----------
  doc.setFillColor(...SOFT_BG);
  doc.rect(0, 0, W, 32, "F");

  doc.setTextColor(...PRIMARY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Essência Capixaba", M, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Perfumes árabes selecionados", M, 21);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...TEXT);
  doc.text("Recibo", W - M, 15, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const dateStr = new Date().toLocaleDateString("pt-BR");
  doc.text(dateStr, W - M, 21, { align: "right" });
  if (payload.orderRef) {
    doc.text(`Pedido #${payload.orderRef.slice(0, 8).toUpperCase()}`, W - M, 26, { align: "right" });
  }

  y = 40;

  if (payload.customerName) {
    doc.setFontSize(11);
    doc.setTextColor(...TEXT);
    doc.setFont("helvetica", "bold");
    doc.text("Cliente:", M, y);
    doc.setFont("helvetica", "normal");
    doc.text(payload.customerName, M + 18, y);
    y += 8;
  }

  // ---------- Items ----------
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  y += 6;

  // Pré-carrega imagens
  const images = await Promise.all(
    payload.items.map((it) => (it.imageUrl ? fetchImageAsDataUrl(it.imageUrl) : Promise.resolve(null))),
  );

  for (let i = 0; i < payload.items.length; i++) {
    const it = payload.items[i];
    const img = images[i];
    const rowH = 22;

    if (y + rowH > H - 70) {
      doc.addPage();
      y = M;
    }

    // Imagem (quadrado)
    if (img) {
      try {
        doc.addImage(img, "JPEG", M, y, 18, 18, undefined, "FAST");
      } catch {
        try {
          doc.addImage(img, "PNG", M, y, 18, 18, undefined, "FAST");
        } catch {
          drawPlaceholder(doc, M, y, it.name);
        }
      }
    } else {
      drawPlaceholder(doc, M, y, it.name);
    }

    // Info
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...TEXT);
    doc.text(it.name, M + 22, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    const meta = `${it.brand || "Sem marca"} · ${it.qty} ${it.qty === 1 ? "frasco" : "frascos"}`;
    doc.text(meta, M + 22, y + 12);

    const unit = it.qty > 0 ? it.total / it.qty : it.total;
    doc.text(`${brl(unit)} cada`, M + 22, y + 17);

    // Total à direita
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...TEXT);
    doc.text(brl(it.total), W - M, y + 10, { align: "right" });

    y += rowH;
    doc.setDrawColor(245, 240, 225);
    doc.line(M, y, W - M, y);
    y += 4;
  }

  // ---------- Totais ----------
  y += 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...PRIMARY);
  doc.text("Total", W - M - 50, y + 6);
  doc.text(brl(payload.total), W - M, y + 6, { align: "right" });
  y += 12;

  // ---------- Observação de pagamento ----------
  doc.setFillColor(...SOFT_BG);
  const obsLines = paymentDescription(payload);
  const obsH = 8 + obsLines.length * 5;
  doc.roundedRect(M, y, W - M * 2, obsH, 2, 2, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT);
  let oy = y + 5;
  for (const line of obsLines) {
    doc.text(line, M + 4, oy);
    oy += 5;
  }
  y += obsH + 10;

  // ---------- PIX ----------
  const pixBoxH = 70;
  if (y + pixBoxH > H - M) {
    doc.addPage();
    y = M;
  }

  doc.setDrawColor(...PRIMARY);
  doc.setLineWidth(0.5);
  doc.roundedRect(M, y, W - M * 2, pixBoxH, 3, 3);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...PRIMARY);
  doc.text("Pague com Pix", W / 2, y + 8, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`${PIX_KEY_TYPE} · ${PIX_RECEIVER}`, W / 2, y + 14, { align: "center" });

  // QR Code do Pix (chave) — escaneie pelo app do banco
  try {
    const qrDataUrl = await QRCode.toDataURL(PIX_KEY, {
      margin: 1,
      width: 320,
      color: { dark: "#000000", light: "#ffffff" },
    });
    doc.addImage(qrDataUrl, "PNG", W / 2 - 14, y + 17, 28, 28);
  } catch {
    /* ignore */
  }

  // Chave em caixa destacada (clicável: copia ao clicar nos visualizadores que suportam JS)
  const keyBoxY = y + 49;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PRIMARY);
  doc.setLineWidth(0.4);
  doc.roundedRect(M + 10, keyBoxY, W - M * 2 - 20, 11, 2, 2, "FD");
  doc.setFont("courier", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...TEXT);
  doc.text(PIX_KEY, W / 2, keyBoxY + 7, { align: "center" });

  // Tenta adicionar ação de copiar (JavaScript no PDF — funciona em Adobe Reader)
  try {
    const anyDoc = doc as any;
    if (typeof anyDoc.createAnnotation === "function") {
      anyDoc.createAnnotation({
        type: "link",
        bounds: { x: M + 10, y: keyBoxY, w: W - M * 2 - 20, h: 11 },
        contents: "Copiar chave Pix",
        action: { type: "JavaScript", script: `app.setClipboard("${PIX_KEY}"); app.alert("Chave Pix copiada!");` },
      });
    }
  } catch {
    /* ignore */
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("Escaneie o QR Code ou toque/copie a chave acima", W / 2, keyBoxY + 16, { align: "center" });

  y += pixBoxH + 8;

  // ---------- Rodapé ----------
  if (y < H - M) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...PRIMARY);
    doc.text("Obrigada pela preferência!", W / 2, H - 14, { align: "center" });
  }

  const safeName = (payload.customerName || "cliente").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const fileName = `recibo-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

function drawPlaceholder(doc: jsPDF, x: number, y: number, name: string) {
  doc.setFillColor(...SOFT_BG);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(x, y, 18, 18, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...MUTED);
  doc.text((name?.[0] || "?").toUpperCase(), x + 9, y + 12, { align: "center" });
}
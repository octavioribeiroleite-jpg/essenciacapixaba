import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScanLine, Camera } from "lucide-react";

export default function Scanner() {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const startScanning = async () => {
    setError(null);
    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // Check if it's a product URL
          const match = decodedText.match(/\/products\/([a-f0-9-]+)/);
          if (match) {
            scanner.stop().catch(() => {});
            navigate(`/products/${match[1]}`);
          }
        },
        () => {} // ignore errors during scanning
      );
      setScanning(true);
    } catch (err: any) {
      setError("Não foi possível acessar a câmera. Verifique as permissões.");
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <ScanLine className="h-5 w-5 text-primary" />
        Escanear QR Code
      </h1>

      <Card className="glass-card overflow-hidden">
        <CardContent className="p-0">
          <div id="qr-reader" className="w-full" />
          {!scanning && (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <Camera className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground text-center mb-4">
                Aponte a câmera para o QR Code da etiqueta do perfume
              </p>
              <Button onClick={startScanning}>
                <Camera className="h-4 w-4 mr-2" /> Abrir Câmera
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {scanning && (
        <Button variant="outline" className="w-full" onClick={stopScanning}>
          Parar Scanner
        </Button>
      )}

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Ao escanear, você será levado diretamente para a página do produto para registrar a venda.
      </p>
    </div>
  );
}

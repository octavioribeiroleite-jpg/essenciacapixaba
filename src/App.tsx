import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import { Droplets } from "lucide-react";

const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Products = lazy(() => import("@/pages/Products"));
const ProductForm = lazy(() => import("@/pages/ProductForm"));
const ProductDetail = lazy(() => import("@/pages/ProductDetail"));
const Sales = lazy(() => import("@/pages/Sales"));
const Reports = lazy(() => import("@/pages/Reports"));
const Catalog = lazy(() => import("@/pages/Catalog"));
const CatalogAdmin = lazy(() => import("@/pages/CatalogAdmin"));
const PurchaseOrder = lazy(() => import("@/pages/PurchaseOrder"));
const Restock = lazy(() => import("@/pages/Restock"));
const Patrimonio = lazy(() => import("@/pages/Patrimonio"));
const PixCopy = lazy(() => import("@/pages/PixCopy"));
const Sellers = lazy(() => import("@/pages/Sellers"));
const Customers = lazy(() => import("@/pages/Customers"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const PageFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Droplets className="h-8 w-8 animate-pulse text-primary" />
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/catalogo" element={<Catalog />} />
            <Route path="/catalogo/:id" element={<Catalog />} />
            <Route path="/pix" element={<PixCopy />} />
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/catalogo" replace />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/products" element={<Products />} />
              <Route path="/products/new" element={<ProductForm />} />
              <Route path="/products/:id" element={<ProductDetail />} />
              <Route path="/sell" element={<Sales />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/pedidos" element={<PurchaseOrder />} />
              <Route path="/compras/nova" element={<Restock />} />
              <Route path="/patrimonio" element={<Patrimonio />} />
              <Route path="/catalogo-admin" element={<CatalogAdmin />} />
              <Route path="/vendedores" element={<Sellers />} />
              <Route path="/clientes" element={<Customers />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

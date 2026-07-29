import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  BarChart3,
  ChevronRight,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  Package,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Início" },
  { to: "/products", icon: Package, label: "Produtos" },
  { to: "/sell", icon: ShoppingCart, label: "Vender" },
  { to: "/clientes", icon: UserRound, label: "Clientes" },
  { to: "/reports", icon: BarChart3, label: "Relatórios" },
  { to: "/vendedores", icon: Users, label: "Vendedores" },
];

export default function AppLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [lastUpdate, setLastUpdate] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("lastUpdateAt") : null
  );
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Mark first-ever load as the initial update reference
    if (!localStorage.getItem("lastUpdateAt")) {
      const ts = new Date().toISOString();
      localStorage.setItem("lastUpdateAt", ts);
      setLastUpdate(ts);
    }
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    toast.loading("Limpando cache e atualizando...", { id: "refresh" });
    try {
      // Clear caches
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      // Unregister service workers
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      localStorage.setItem("lastUpdateAt", new Date().toISOString());
    } catch (err) {
      // ignore — still reload
    } finally {
      // Force a hard reload bypassing browser cache via cache-busting param
      const url = new URL(window.location.href);
      url.searchParams.set("_r", Date.now().toString());
      window.location.replace(url.toString());
    }
  };

  const lastUpdateLabel = lastUpdate
    ? format(new Date(lastUpdate), "dd/MM HH:mm", { locale: ptBR })
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-hidden border-r border-white/5 bg-[#171512] text-white shadow-[12px_0_40px_rgba(22,18,12,0.08)] lg:flex">
        <div className="premium-grid relative border-b border-white/10 px-5 py-6">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#c8a45d]/15 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d3b46f]/30 bg-gradient-to-br from-[#c8a45d] to-[#94712f] shadow-lg shadow-black/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold tracking-tight text-white">Essência Capixaba</span>
              <span className="mt-1 block text-[10px] uppercase tracking-[0.16em] text-[#d8c7a3]">
                Gestão de perfumaria
              </span>
            </div>
          </div>
          <div className="relative mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
            <span className="status-dot" />
            <span className="text-[11px] text-white/65">Sistema operacional</span>
            {lastUpdateLabel && (
              <span className="ml-auto text-[10px] text-white/40">{lastUpdateLabel}</span>
            )}
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          <p className="mb-3 px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">
            Operação
          </p>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-[#c8a45d]/20 to-[#c8a45d]/5 font-medium text-[#e4c887] shadow-[inset_3px_0_0_#c8a45d]"
                    : "text-white/55 hover:bg-white/[0.055] hover:text-white"
                )
              }
            >
              <item.icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{item.label}</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-40" />
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1 border-t border-white/10 p-4">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            <span>Atualizar</span>
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Header */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border/60 bg-background/90 px-4 backdrop-blur-xl lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#171512] text-[#d7b868] shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <span className="block font-semibold text-foreground text-sm truncate">Essência Capixaba</span>
            {lastUpdateLabel && (
              <span className="block text-[9px] text-muted-foreground/70">
                Atualizado {lastUpdateLabel}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleSignOut}
          aria-label="Sair"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground"
        >
          <CircleUserRound className="h-5 w-5" />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-4 py-5 pb-24 lg:pb-8 lg:pl-[17.5rem] lg:pr-8 lg:py-8">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-card/95 shadow-[0_-8px_28px_rgba(28,24,18,0.07)] backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-6 items-end px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
          {navItems.slice(0, 2).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "relative flex flex-col items-center gap-1 px-1 py-1.5 text-[10px] font-medium transition-colors",
                  isActive ? "text-primary after:absolute after:-top-2 after:h-0.5 after:w-7 after:rounded-full after:bg-primary" : "text-muted-foreground"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* Center: Vender */}
          <NavLink
            to="/sell"
            className={({ isActive }) =>
              cn(
                "relative -mt-5 flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-2xl border-4 border-card shadow-[0_8px_20px_rgba(156,117,45,0.28)] transition-all",
                    isActive ? "bg-[#171512] text-[#e0c277]" : "bg-primary text-primary-foreground"
                  )}
                >
                  <ShoppingCart className="h-6 w-6" />
                </div>
                <span className="mt-1">Vender</span>
              </>
            )}
          </NavLink>

          {navItems.slice(3).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "relative flex flex-col items-center gap-1 px-1 py-1.5 text-[10px] font-medium transition-colors",
                  isActive ? "text-primary after:absolute after:-top-2 after:h-0.5 after:w-7 after:rounded-full after:bg-primary" : "text-muted-foreground"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* Refresh / clear cache */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex flex-col items-center gap-1 px-1 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
          >
            <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
            <span>Atualizar</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

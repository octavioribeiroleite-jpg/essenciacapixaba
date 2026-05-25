import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Package, ShoppingCart, BarChart3, LogOut, Droplets, RefreshCw } from "lucide-react";
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
  { to: "/reports", icon: BarChart3, label: "Relatórios" },
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
    <div className="flex min-h-screen flex-col bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-border/60 bg-card/60 backdrop-blur">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-border/50">
          <Droplets className="h-6 w-6 text-primary" />
          <div className="leading-tight">
            <span className="block font-semibold text-foreground text-sm">Essência Capixaba</span>
            {lastUpdateLabel && (
              <span className="block text-[10px] text-muted-foreground/70">
                Atualizado {lastUpdateLabel}
              </span>
            )}
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-150 border-l-[3px] border-transparent",
                  isActive
                    ? "bg-primary/10 text-primary font-medium border-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border/50 space-y-1">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            <span>Atualizar</span>
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Header */}
      <header className="lg:hidden sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/50 bg-background/95 backdrop-blur px-4">
        <div className="flex items-center gap-2 min-w-0">
          <Droplets className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0 leading-tight">
            <span className="block font-semibold text-foreground text-sm truncate">Essência Capixaba</span>
            {lastUpdateLabel && (
              <span className="block text-[9px] text-muted-foreground/70">
                Atualizado {lastUpdateLabel}
              </span>
            )}
          </div>
        </div>
        <button onClick={handleSignOut} className="text-muted-foreground hover:text-foreground transition-colors">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20 lg:pb-8 px-4 py-4 lg:pl-[15.5rem] lg:pr-8 lg:py-8">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border/50 bg-background/95 backdrop-blur">
        <div className="grid grid-cols-5 items-center py-2">
          {navItems.slice(0, 2).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-1 py-1.5 text-[11px] transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
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
                "flex flex-col items-center gap-0.5 px-1 py-1.5 text-[11px] transition-colors relative -mt-5",
                isActive ? "text-primary" : "text-muted-foreground"
              )
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors",
                    isActive ? "bg-primary text-primary-foreground" : "bg-primary/80 text-primary-foreground"
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
                  "flex flex-col items-center gap-0.5 px-1 py-1.5 text-[11px] transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
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
            className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
            <span>Atualizar</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

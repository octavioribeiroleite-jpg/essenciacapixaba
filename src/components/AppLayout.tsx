import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Package, ScanLine, BarChart3, LogOut, Droplets } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Início" },
  { to: "/products", icon: Package, label: "Produtos" },
  { to: "/scan", icon: ScanLine, label: "Escanear" },
  { to: "/reports", icon: BarChart3, label: "Relatórios" },
];

export default function AppLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/50 bg-background/95 backdrop-blur px-4">
        <div className="flex items-center gap-2">
          <Droplets className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground text-sm">Essência Capixaba</span>
        </div>
        <button onClick={handleSignOut} className="text-muted-foreground hover:text-foreground transition-colors">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20 px-4 py-4">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/50 bg-background/95 backdrop-blur">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs transition-colors",
                  item.to === "/scan"
                    ? "relative -mt-5"
                    : "",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {item.to === "/scan" ? (
                    <div className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors",
                      isActive ? "bg-primary text-primary-foreground" : "bg-primary/80 text-primary-foreground"
                    )}>
                      <item.icon className="h-6 w-6" />
                    </div>
                  ) : (
                    <item.icon className="h-5 w-5" />
                  )}
                  <span className={item.to === "/scan" ? "mt-1" : ""}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

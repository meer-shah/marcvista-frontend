import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  TrendingUp,
  Shield,
  PieChart,
  LogOut,
  Bell,
  Settings,
  User as UserIcon,
  Menu,
  Link2,
  X,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authService } from "@/lib/auth";
import type { User } from "@/lib/auth";
import MarcvistaLogo from "@/components/MarcvistaLogo";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { name: "Trade", path: "/trading", icon: TrendingUp },
  { name: "Exchange", path: "/exchange", icon: Link2 },
  { name: "Risk Profile", path: "/risk-profile", icon: Shield },
  { name: "Portfolio", path: "/portfolio", icon: PieChart },
];

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    authService.getCurrentUser().then(setCurrentUser);

    const handleProfileUpdate = (e: CustomEvent) => {
      setCurrentUser((prev) => prev ? { ...prev, ...e.detail } : e.detail);
    };
    window.addEventListener("userProfileUpdated", handleProfileUpdate as EventListener);
    return () => window.removeEventListener("userProfileUpdated", handleProfileUpdate as EventListener);
  }, []);

  const handleLogout = async () => {
    try {
      await authService.logout();
    } finally {
      navigate("/login");
    }
  };

  const displayName = currentUser?.name || currentUser?.email?.split("@")[0] || "User";
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex flex-col min-h-screen w-full bg-background text-foreground overflow-x-hidden">
      {/* ── Top Navbar ── */}
      <header className="sticky top-0 z-40 w-full h-16 bg-[#111111]/95 backdrop-blur-lg border-b border-white/8 flex items-center px-3 sm:px-5 gap-3">

        {/* Mobile: hamburger → Sheet sidebar */}
        <div className="flex items-center lg:hidden shrink-0">
          <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[75vw] max-w-[280px] p-0 bg-[#111111] border-r border-white/8">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <div className="flex flex-col h-full">
                {/* Sidebar header: logo + X */}
                <div className="flex items-center justify-between px-4 py-4 border-b border-white/8 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <MarcvistaLogo className="w-7 h-7 shrink-0" />
                    <span className="font-bold text-sm tracking-wide truncate">Marcvista</span>
                  </div>
                  <button
                    onClick={() => setIsMobileOpen(false)}
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                    aria-label="Close menu"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Nav links */}
                <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
                  {navItems.map((item) => {
                    const active = isActive(item.path);
                    return (
                      <button
                        key={item.name}
                        onClick={() => { navigate(item.path); setIsMobileOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                          active
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                        }`}
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        {item.name}
                      </button>
                    );
                  })}
                </nav>

                {/* Bottom: logout */}
                <div className="px-3 pb-5 pt-3 border-t border-white/8">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-red-400 hover:bg-red-500/5 transition-all duration-200"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    Log out
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Logo */}
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
        >
          <MarcvistaLogo className="w-7 h-7" />
          <span className="font-bold text-sm sm:text-base tracking-wide hidden sm:inline">Marcvista</span>
        </button>

        {/* Desktop nav links */}
        <nav className="hidden lg:flex items-center gap-0.5 flex-1 ml-2 overflow-x-auto">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.name}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                <item.icon className="w-3.5 h-3.5 shrink-0" />
                {item.name}
              </button>
            );
          })}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-1 sm:gap-2 ml-auto shrink-0">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Bell className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hidden sm:inline-flex">
            <Settings className="w-4 h-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 pl-2 sm:pl-3 ml-1 border-l border-white/10 hover:opacity-80 transition-opacity">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
                  {(currentUser as any)?.profilePicture ? (
                    <img src={(currentUser as any).profilePicture} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-4 h-4 text-primary" />
                  )}
                </div>
                <div className="hidden md:flex flex-col text-left max-w-[120px]">
                  <span className="text-xs font-semibold leading-tight text-foreground truncate">{displayName}</span>
                  <span className="text-xs text-muted-foreground leading-tight truncate">{currentUser?.email}</span>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-[#1B1B1B] border-white/10">
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                <UserIcon className="mr-2 h-4 w-4" />
                Profile Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-400 focus:text-red-400">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 w-full p-3 sm:p-5 lg:p-6 overflow-x-hidden min-w-0">
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;

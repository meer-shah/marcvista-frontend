import { useState, useEffect } from "react";
import { Menu, Bell, User as UserIcon, LogOut } from "lucide-react";
import MarcvistaLogo from "@/components/MarcvistaLogo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { useNavigate, useLocation } from "react-router-dom";
import { authService } from "@/lib/auth";
import type { User } from "@/lib/auth";

const DashboardNavigation = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Fetch current user on mount
    const fetchUser = async () => {
      const user = await authService.getCurrentUser();
      setCurrentUser(user);
    };
    fetchUser();
  }, []);

  const handleNavigation = (path: string) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      // Still navigate to login even if logout fails
      navigate('/login');
    }
  };

  const navItems = [
    { name: "Dashboard", path: "/dashboard", isActive: location.pathname === '/dashboard' },
    { name: "Trading Panel", path: "/trading", isActive: location.pathname === '/trading' },
    { name: "AI Signals", path: "/ai-signals", isActive: location.pathname === '/ai-signals' },
    { name: "Risk Profile", path: "/risk-profile", isActive: location.pathname === '/risk-profile' },
    { name: "Portfolio", path: "/portfolio", isActive: location.pathname === '/portfolio' },
    { name: "Blog", path: "/blog", isActive: location.pathname === '/blog' },
  ];

  const displayName = currentUser?.name || currentUser?.email || "User";

  return (
    <header className="sticky top-0 z-50 w-full h-16 bg-[#1B1B1B]/95 backdrop-blur-lg border-b border-white/10">
      <div className="w-full h-full px-6">
        <nav className="flex items-center justify-between h-full">
          <div className="flex items-center gap-2">
            <MarcvistaLogo className="w-7 h-7" />
            <span className="font-bold text-base">Marcvista</span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-4">
            {navItems.map((item) => (
              <Button
                key={item.name}
                variant="ghost"
                size="sm"
                onClick={() => handleNavigation(item.path)}
                className={`text-sm transition-all duration-300 ${
                  item.isActive
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.name}
              </Button>
            ))}

            {/* User Actions */}
            <div className="flex items-center gap-2 ml-4">
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <Bell className="w-4 h-4" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <UserIcon className="w-4 h-4" />
                    <span className="text-sm hidden sm:inline">{displayName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 bg-[#1B1B1B] border-white/10">
                  <DropdownMenuItem>
                    <UserIcon className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Mobile Navigation */}
          <div className="lg:hidden">
            <div className="flex items-center gap-2">
              {/* Mobile User Actions */}
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <Bell className="w-4 h-4" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <UserIcon className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 bg-[#1B1B1B] border-white/10">
                  <DropdownMenuItem>
                    <UserIcon className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="glass">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="bg-[#1B1B1B] border-white/10 w-80">
                  <div className="flex flex-col gap-4 mt-8">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <MarcvistaLogo className="w-7 h-7" />
                        <span className="font-bold text-base">Marcvista</span>
                      </div>
                    </div>

                    {navItems.map((item) => (
                      <Button
                        key={item.name}
                        variant="ghost"
                        onClick={() => handleNavigation(item.path)}
                        className={`justify-start text-left ${
                          item.isActive
                            ? 'text-primary bg-primary/10'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {item.name}
                      </Button>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
};

export default DashboardNavigation;

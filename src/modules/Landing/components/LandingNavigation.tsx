import { useState } from "react";
import { Menu } from "lucide-react";
import MarcvistaLogo from "@/components/MarcvistaLogo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useNavigate } from "react-router-dom";

const LandingNavigation = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const scrollToSection = (sectionId: string) => {
    if (sectionId === 'testimonials') {
      const testimonialSection = document.querySelector('.animate-marquee');
      if (testimonialSection) {
        const yOffset = -100;
        const y = testimonialSection.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    } else if (sectionId === 'cta') {
      navigate('/login');
    } else {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const navItems = [
    { name: "Features", href: "#features", onClick: () => scrollToSection('features') },
    { name: "Prices", href: "#pricing", onClick: () => scrollToSection('pricing') },
    { name: "Testimonials", href: "#testimonials", onClick: () => scrollToSection('testimonials') },
  ];

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
              <a
                key={item.name}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  if (item.onClick) {
                    item.onClick();
                  }
                }}
                className="text-sm text-muted-foreground hover:text-foreground transition-all duration-300"
              >
                {item.name}
              </a>
            ))}
            
            <Button 
              onClick={() => scrollToSection('cta')}
              size="sm"
              className="button-gradient"
            >
              Start Trading
            </Button>
          </div>

          {/* Mobile Navigation */}
          <div className="lg:hidden">
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
                    <a
                      key={item.name}
                      href={item.href}
                      onClick={(e) => {
                        e.preventDefault();
                        if (item.onClick) {
                          item.onClick();
                        }
                        setIsMobileMenuOpen(false);
                      }}
                      className="text-sm text-muted-foreground hover:text-foreground transition-all duration-300"
                    >
                      {item.name}
                    </a>
                  ))}
                  
                  <Button 
                    onClick={() => {
                      scrollToSection('cta');
                      setIsMobileMenuOpen(false);
                    }}
                    size="sm"
                    className="button-gradient mt-4"
                  >
                    Start Trading
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </nav>
      </div>
    </header>
  );
};

export default LandingNavigation; 
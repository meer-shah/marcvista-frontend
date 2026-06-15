import { Github, Twitter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/common";

const linkColumns = [
  {
    heading: "Trading",
    links: [
      { label: "Markets", href: "#features" },
      { label: "Trading Fees", href: "#pricing" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Trading Guide", href: "#" },
      { label: "Market Analysis", href: "#" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
    ],
  },
];

const Footer = () => {
  return (
    <footer className="w-full py-12 mt-20">
      <div className="container px-4">
        <GlassCard hover>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <h3 className="font-medium text-lg">Marcvista</h3>
              <p className="text-sm text-muted-foreground">
                Empowering traders with advanced crypto trading solutions.
              </p>
              <div className="flex space-x-4">
                <Button variant="ghost" size="icon">
                  <Twitter className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon">
                  <Github className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {linkColumns.map((column) => (
              <div key={column.heading} className="space-y-4">
                <h4 className="font-medium">{column.heading}</h4>
                <ul className="space-y-2">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-8 border-t border-white/10">
            <p className="text-sm text-muted-foreground text-center">
              © {new Date().getFullYear()} Marcvista. All rights reserved.
            </p>
          </div>
        </GlassCard>
      </div>
    </footer>
  );
};

export default Footer;

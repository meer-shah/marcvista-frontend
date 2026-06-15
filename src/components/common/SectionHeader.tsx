import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}

/**
 * Marketing/section heading wrapper. Replaces the repeated
 * `text-5xl md:text-6xl` heading + constrained subtitle blocks in
 * FeaturesSection, PricingSection and TestimonialsSection.
 */
export const SectionHeader = ({
  title,
  subtitle,
  align = "center",
  className,
}: SectionHeaderProps) => (
  <div
    className={cn(
      "mb-12",
      align === "center" ? "max-w-2xl mx-auto text-center" : "max-w-3xl",
      className
    )}
  >
    <h2 className="text-4xl md:text-6xl font-normal mb-6 tracking-tight">{title}</h2>
    {subtitle && <p className="text-lg text-muted-foreground">{subtitle}</p>}
  </div>
);

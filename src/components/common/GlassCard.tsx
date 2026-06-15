import * as React from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const PAD: Record<NonNullable<GlassCardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

/**
 * Glass-morphism card built on the existing `.glass` global class. Replaces
 * the `glass rounded-xl p-8` wrappers in Footer and FeatureContent.
 */
export const GlassCard = ({
  hover,
  padding = "lg",
  className,
  ...props
}: GlassCardProps) => (
  <div
    className={cn("glass rounded-xl", PAD[padding], hover && "glass-hover", className)}
    {...props}
  />
);

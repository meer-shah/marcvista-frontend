import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

export type CardVariant = "dark" | "light" | "orange";

/** Maps a card theme to the matching global shell class (see index.css). */
export const cardShellClass = (variant: CardVariant = "dark") =>
  variant === "light"
    ? "card-shell-white"
    : variant === "orange"
    ? "card-shell-orange"
    : "card-shell";

interface AppCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

/**
 * The app's signature elevated panel. Replaces the dark/light/orange card
 * shell class strings that were duplicated 28-40+ times across screens.
 * Per-element classNames still win via tailwind-merge.
 */
export const AppCard = React.forwardRef<HTMLDivElement, AppCardProps>(
  ({ variant = "dark", className, ...props }, ref) => (
    <div ref={ref} className={cn(cardShellClass(variant), className)} {...props} />
  )
);
AppCard.displayName = "AppCard";

interface MotionCardProps extends HTMLMotionProps<"div"> {
  variant?: CardVariant;
  /** Stagger delay (seconds) for the entrance animation. */
  delay?: number;
}

/**
 * AppCard + a consistent fade/slide-up entrance. Promoted from the local
 * definition that lived in UserPortfolioPage and was re-implemented across
 * Dashboard / Risk pages.
 */
export const MotionCard = React.forwardRef<HTMLDivElement, MotionCardProps>(
  ({ variant = "dark", delay = 0, className, ...props }, ref) => (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={cn(cardShellClass(variant), className)}
      {...props}
    />
  )
);
MotionCard.displayName = "MotionCard";

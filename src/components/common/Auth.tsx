import * as React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, type LucideIcon } from "lucide-react";
import MarcvistaLogo from "@/components/MarcvistaLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Full-screen auth shell: dark background, fade-in, centered max-w-md card, and
 * a "Back to Home" link. Wraps the three near-duplicate auth pages.
 */
export const AuthLayout = ({
  children,
  showBackLink = true,
  className,
}: {
  children: React.ReactNode;
  showBackLink?: boolean;
  className?: string;
}) => (
  <div className="min-h-screen bg-[#070707] flex items-center justify-center p-4">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md relative z-10"
    >
      <Card
        className={cn(
          "bg-[#0a0a0a] border-white/[0.07] rounded-2xl shadow-[0_16px_50px_-12px_rgba(0,0,0,0.9)]",
          className
        )}
      >
        {children}
      </Card>

      {showBackLink && (
        <div className="mt-6 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      )}
    </motion.div>
  </div>
);

/** Logo + title + subtitle header inside an auth card. */
export const AuthCardHeader = ({
  title,
  subtitle,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}) => (
  <CardHeader className="text-center space-y-4">
    <Link to="/" className="inline-flex items-center justify-center gap-2 mb-4">
      <MarcvistaLogo className="w-8 h-8" />
      <span className="font-bold text-xl">Marcvista</span>
    </Link>
    <CardTitle className="text-xl sm:text-2xl font-bold">{title}</CardTitle>
    {subtitle && <CardDescription className="text-muted-foreground">{subtitle}</CardDescription>}
  </CardHeader>
);

/** Show/hide toggle for password inputs. */
export const PasswordToggle = ({
  show,
  onToggle,
  className,
}: {
  show: boolean;
  onToggle: () => void;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-label={show ? "Hide password" : "Show password"}
    className={cn(
      "absolute right-3 top-3 text-muted-foreground hover:text-foreground",
      className
    )}
  >
    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
  </button>
);

interface AuthFormFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: React.ReactNode;
  icon?: LucideIcon;
  /** Right-side adornment, e.g. a <PasswordToggle/>. */
  endAdornment?: React.ReactNode;
}

/** Label + left icon + Input in one consistent field block. */
export const AuthFormField = ({
  id,
  label,
  icon: Icon,
  endAdornment,
  className,
  ...inputProps
}: AuthFormFieldProps) => (
  <div className="form-row">
    <Label htmlFor={id} className="text-sm font-medium">
      {label}
    </Label>
    <div className="relative">
      {Icon && <Icon className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />}
      <Input
        id={id}
        className={cn(Icon && "pl-10", endAdornment && "pr-10", "input-dark", className)}
        {...inputProps}
      />
      {endAdornment}
    </div>
  </div>
);

/** Submit button + alternative action link beneath an auth form. */
export const AuthFormFooter = ({
  submitLabel,
  loadingLabel,
  loading,
  altText,
  linkLabel,
  linkTo,
}: {
  submitLabel: string;
  /** Text shown while `loading`. Defaults to "Please wait...". */
  loadingLabel?: string;
  loading?: boolean;
  altText?: React.ReactNode;
  linkLabel?: string;
  linkTo?: string;
}) => (
  <CardFooter className="flex flex-col space-y-4">
    <Button type="submit" className="w-full button-gradient" disabled={loading}>
      {loading ? loadingLabel ?? "Please wait..." : submitLabel}
    </Button>
    {altText && linkLabel && linkTo && (
      <div className="text-center text-sm text-muted-foreground">
        {altText}{" "}
        <Link to={linkTo} className="text-primary hover:text-primary/80 transition-colors">
          {linkLabel}
        </Link>
      </div>
    )}
  </CardFooter>
);

export { CardContent as AuthCardContent };

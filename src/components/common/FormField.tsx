import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Label + control + error in one consistently-spaced block (.form-row).
 * Replaces the 30+ `<div className="space-y-2"><Label/>...<input/></div>`
 * blocks across auth forms, Profile, and all create/edit dialogs.
 */
export const FormField = ({
  label,
  htmlFor,
  error,
  required,
  className,
  children,
}: FormFieldProps) => (
  <div className={cn("form-row", className)}>
    {label && (
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
    )}
    {children}
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
);

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ModalFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional footer (submit/cancel). Omit to render none. */
  footer?: React.ReactNode;
  /** When provided, the body is wrapped in a <form>. */
  onSubmit?: (e: React.FormEvent) => void;
  contentClassName?: string;
  children: React.ReactNode;
}

/**
 * Dialog + header + (optional form) + footer wrapper for the 7+ create/edit
 * modals (new goal, new risk profile, connect exchange, guide, risk-fee).
 * Defaults the content to the dark, scrollable surface used app-wide.
 */
export const ModalForm = ({
  open,
  onOpenChange,
  title,
  description,
  footer,
  onSubmit,
  contentClassName,
  children,
}: ModalFormProps) => {
  const body = (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      {children}
      {footer && <DialogFooter>{footer}</DialogFooter>}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "bg-[#1B1B1B] border-white/10 w-[95vw] max-w-2xl max-h-[min(90vh,calc(100vh-2rem))] overflow-y-auto",
          contentClassName
        )}
      >
        {onSubmit ? <form onSubmit={onSubmit}>{body}</form> : body}
      </DialogContent>
    </Dialog>
  );
};

"use client";

import {
  useEffect,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

type ModalShellProps = {
  children: ReactNode;
  onClose: () => void;
  /** Close when Escape is pressed (default true). */
  closeOnEscape?: boolean;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "onClick" | "className">;

/**
 * Full-viewport modal backdrop. Clicking the dimmed shell (not the panel)
 * calls onClose. Put interactive content in a child element so only the
 * backdrop itself matches e.target === e.currentTarget.
 */
export function ModalShell({
  children,
  onClose,
  closeOnEscape = true,
  className,
  role = "dialog",
  ...rest
}: ModalShellProps) {
  useEffect(() => {
    if (!closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeOnEscape, onClose]);

  function onBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      {...rest}
      role={role}
      aria-modal={rest["aria-modal"] ?? true}
      className={className}
      onClick={onBackdropClick}
    >
      {children}
    </div>
  );
}

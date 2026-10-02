import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function Spinner({ size = 14, label }: { size?: number; label?: string }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

/** A message tied to the surface it sits in: a failed save, a missing key. */
export function InlineAlert({
  tone = "info",
  children,
  action,
}: {
  tone?: "info" | "warning" | "error";
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="alert" data-tone={tone} role={tone === "error" ? "alert" : "status"}>
      <Icon name="alert" className="alert-icon" />
      <div className="alert-body">{children}</div>
      {action && <div className="alert-action">{action}</div>}
    </div>
  );
}

/** One quiet, left-aligned line when there is nothing to list. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p className="empty-body">{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/** A transient confirmation pinned to the bottom of the panel. */
export function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="toast" role="status" aria-live="polite">
      <Icon name="check" />
      {children}
    </div>
  );
}

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const initials =
    name
      .replace(/@.*/, "")
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?";

  return (
    <span className="avatar" style={{ width: size, height: size }} aria-hidden="true">
      {initials}
    </span>
  );
}

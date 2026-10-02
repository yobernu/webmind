import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export interface MenuItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  tone?: "danger";
  /** Draws a rule above this item. */
  separated?: boolean;
}

/**
 * A disclosure menu: a trigger that shows a short list of actions. Escape
 * and clicks outside close it and hand focus back to the trigger; the arrow
 * keys move between items.
 */
export function Menu({
  trigger,
  label,
  items,
  header,
}: {
  /** Render prop for the trigger button's contents. */
  trigger: ReactNode;
  label: string;
  items: MenuItem[];
  /** Optional non-interactive heading, e.g. the signed-in email. */
  header?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;

    list.current?.querySelector<HTMLButtonElement>("button")?.focus();

    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    event.preventDefault();
    const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div className="menu" ref={root} onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={button}
        type="button"
        className="menu-trigger"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && (
        <div className="menu-list" id={id} ref={list}>
          {header && <div className="menu-header">{header}</div>}
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className="menu-item"
              data-tone={item.tone}
              data-separated={item.separated || undefined}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              {item.icon && <Icon name={item.icon} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useRef, type KeyboardEvent } from "react";
import { tabId, tabPanelId } from "./tabIds";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}


/**
 * Underlined tabs with the ARIA tabs pattern: one tab stop, arrow keys move
 * between tabs and activate them, Home and End jump to the ends.
 */
export function Tabs<T extends string>({
  items,
  selected,
  onSelect,
  label,
  idBase,
}: {
  items: TabItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
  label: string;
  idBase: string;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const target =
      event.key === "ArrowRight"
        ? index === last ? 0 : index + 1
        : event.key === "ArrowLeft"
          ? index === 0 ? last : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (target === null) return;

    event.preventDefault();
    const next = items[target];
    onSelect(next.id);
    refs.current.get(next.id)?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => {
        const active = item.id === selected;
        return (
          <button
            key={item.id}
            ref={(element) => {
              if (element) refs.current.set(item.id, element);
              else refs.current.delete(item.id);
            }}
            type="button"
            role="tab"
            id={tabId(idBase, item.id)}
            aria-selected={active}
            aria-controls={tabPanelId(idBase, item.id)}
            tabIndex={active ? 0 : -1}
            className="tab"
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => move(event, index)}
          >
            {item.label}
            {item.count ? (
              <>
                <span className="tab-count" aria-hidden="true">
                  {item.count}
                </span>
                <span className="visually-hidden">, {item.count}</span>
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

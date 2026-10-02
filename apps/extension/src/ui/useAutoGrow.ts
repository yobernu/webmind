import { useCallback, useLayoutEffect, useRef } from "react";

/** Grows with its content. `field-sizing: content` needs Chrome 123, newer
 * than the extension's minimum, so the height is set from scrollHeight. */
export function useAutoGrow(value: unknown, maxHeight = 220) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight + 2, maxHeight)}px`;
    element.style.overflowY = element.scrollHeight + 2 > maxHeight ? "auto" : "hidden";
  }, [maxHeight]);

  useLayoutEffect(resize, [resize, value]);

  return ref;
}

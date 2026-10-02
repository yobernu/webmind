import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Icon, type IconName } from "./Icon";
import { useAutoGrow } from "./useAutoGrow";

interface FieldChrome {
  label: string;
  /** Visually hide the label but keep it for assistive technology. */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string | null;
}

function FieldFrame({
  id,
  label,
  hideLabel,
  hint,
  error,
  children,
}: FieldChrome & { id: string; children: ReactNode }) {
  return (
    <div className="field" data-invalid={error ? true : undefined}>
      <label htmlFor={id} className={hideLabel ? "visually-hidden" : "field-label"}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : (
        hint && (
          <p className="field-hint" id={`${id}-hint`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function describedBy(id: string, hint: ReactNode, error?: string | null) {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

export type TextFieldProps = FieldChrome &
  InputHTMLAttributes<HTMLInputElement> & {
    /** An icon drawn inside the field, before the text. */
    icon?: IconName;
  };

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hideLabel, hint, error, icon, id: given, className, ...rest },
  ref,
) {
  const fallback = useId();
  const id = given ?? fallback;
  return (
    <FieldFrame id={id} label={label} hideLabel={hideLabel} hint={hint} error={error}>
      <div className="input-wrap" data-icon={icon ? true : undefined}>
        {icon && <Icon name={icon} className="input-icon" />}
        <input
          ref={ref}
          id={id}
          className={["input", className].filter(Boolean).join(" ")}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          {...rest}
        />
      </div>
    </FieldFrame>
  );
});

export type TextAreaProps = FieldChrome &
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    /** Grows with its content up to this many pixels, then scrolls. */
    maxHeight?: number;
  };

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hideLabel, hint, error, id: given, className, maxHeight, value, ...rest },
  forwarded,
) {
  const fallback = useId();
  const id = given ?? fallback;
  const ref = useAutoGrow(value, maxHeight);
  return (
    <FieldFrame id={id} label={label} hideLabel={hideLabel} hint={hint} error={error}>
      <textarea
        ref={(element) => {
          ref.current = element;
          if (typeof forwarded === "function") forwarded(element);
          else if (forwarded) forwarded.current = element;
        }}
        id={id}
        value={value}
        className={["input", "textarea", className].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
    </FieldFrame>
  );
});

export type SelectProps = FieldChrome & SelectHTMLAttributes<HTMLSelectElement>;

/** The native select, restyled; the popup stays the platform's own. */
export function Select({ label, hideLabel, hint, error, id: given, className, children, ...rest }: SelectProps) {
  const fallback = useId();
  const id = given ?? fallback;
  return (
    <FieldFrame id={id} label={label} hideLabel={hideLabel} hint={hint} error={error}>
      <div className="select-wrap">
        <select
          id={id}
          className={["input", "select", className].filter(Boolean).join(" ")}
          aria-describedby={describedBy(id, hint, error)}
          {...rest}
        >
          {children}
        </select>
        <Icon name="chevron" className="select-chevron" />
      </div>
    </FieldFrame>
  );
}

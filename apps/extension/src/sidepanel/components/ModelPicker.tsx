import { useState } from "react";
import type { AiProviderId, AiStatus } from "../../types";

interface ModelPickerProps {
  status: AiStatus;
  /** Persists the choice; resolves with the server's new view of the state. */
  onChange: (provider: AiProviderId, model?: string) => Promise<void>;
  disabled?: boolean;
}

/**
 * Lets the user choose which provider and model answers their questions.
 *
 * Providers the server has no key for are listed but disabled, so it is clear
 * the option exists and needs configuring rather than silently missing.
 */
export default function ModelPicker({
  status,
  onChange,
  disabled,
}: ModelPickerProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = status.selected;
  const current = status.providers.find((p) => p.id === selected?.provider);
  const usable = status.providers.filter((p) => p.enabled);

  const apply = async (provider: AiProviderId, model?: string) => {
    setSaving(true);
    setError(null);

    try {
      await onChange(provider, model);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save that choice");
    } finally {
      setSaving(false);
    }
  };

  if (!status.enabled || !selected) return null;

  return (
    <div className="model-picker">
      <label className="model-picker-field">
        <span>Answered by</span>
        <select
          value={selected.provider}
          disabled={disabled || saving}
          onChange={(event) => void apply(event.target.value as AiProviderId)}
        >
          {status.providers.map((provider) => (
            <option
              key={provider.id}
              value={provider.id}
              disabled={!provider.enabled}
            >
              {provider.label}
              {provider.enabled ? "" : " — not configured"}
            </option>
          ))}
        </select>
      </label>

      {/* A single-model provider needs no second dropdown. */}
      {current && current.models.length > 1 && (
        <label className="model-picker-field">
          <span>Model</span>
          <select
            value={selected.model}
            disabled={disabled || saving}
            onChange={(event) =>
              void apply(selected.provider, event.target.value)
            }
          >
            {current.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
      )}

      {usable.length === 1 && (
        <p className="model-picker-note">
          Only {usable[0].label} is configured on this server.
        </p>
      )}

      {!status.retrievalAvailable && (
        <p className="model-picker-note">
          No embedding provider is configured, so long pages are truncated
          rather than searched for the most relevant passages.
        </p>
      )}

      {error && (
        <p className="model-picker-note" role="alert" data-kind="error">
          {error}
        </p>
      )}
    </div>
  );
}

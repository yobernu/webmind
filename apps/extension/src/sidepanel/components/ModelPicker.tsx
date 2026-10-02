import { useState } from "react";
import type { AiProviderId, AiStatus } from "../../types";
import { InlineAlert, Select } from "../../ui";

interface ModelPickerProps {
  status: AiStatus;
  /** Persists the choice; resolves with the server's new view of the state. */
  onChange: (provider: AiProviderId, model?: string) => Promise<void>;
  disabled?: boolean;
}

/**
 * Which provider and model answer this user's questions. Providers without a
 * key are listed but disabled, so it is clear the option exists and needs
 * configuring rather than silently missing.
 */
export default function ModelPicker({ status, onChange, disabled }: ModelPickerProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = status.selected;
  const current = status.providers.find((provider) => provider.id === selected?.provider);

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

  if (!status.enabled || !selected) {
    return (
      <InlineAlert tone="warning">
        <p>No provider can answer yet. Add an API key below to start asking.</p>
      </InlineAlert>
    );
  }

  return (
    <div className="settings-stack">
      <Select
        label="Provider"
        value={selected.provider}
        disabled={disabled || saving}
        onChange={(event) => void apply(event.target.value as AiProviderId)}
        hint={selected.usingUserKey ? "Billed to your own API key." : "Billed to this server’s key."}
      >
        {status.providers.map((provider) => (
          <option key={provider.id} value={provider.id} disabled={!provider.enabled}>
            {provider.label}
            {provider.enabled ? "" : " (needs a key)"}
          </option>
        ))}
      </Select>

      {current && current.models.length > 1 && (
        <Select
          label="Model"
          value={selected.model}
          disabled={disabled || saving}
          onChange={(event) => void apply(selected.provider, event.target.value)}
        >
          {current.models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </Select>
      )}

      {!status.retrievalAvailable && (
        <p className="settings-note">
          Without an embedding provider, long pages are cut to fit instead of searched for the
          passages that matter.
        </p>
      )}

      {error && (
        <InlineAlert tone="error">
          <p>{error}</p>
        </InlineAlert>
      )}
    </div>
  );
}

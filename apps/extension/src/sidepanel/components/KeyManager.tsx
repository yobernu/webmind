import { useState, type FormEvent } from "react";
import { deleteCredential, saveCredential } from "../../api/credentials";
import { ApiError } from "../../api/client";
import type { AiProviderId, AiStatus, ProviderCredentialSummary } from "../../types";
import { Button, InlineAlert, TextField } from "../../ui";

/** Where each provider's keys are issued, so the user knows where to go. */
const KEY_PAGES: Record<AiProviderId, string> = {
  gemini: "https://aistudio.google.com/apikey",
  openrouter: "https://openrouter.ai/keys",
  anthropic: "https://console.anthropic.com/settings/keys",
};

/** The user's own provider keys: one row per provider. */
export default function KeyManager({
  status,
  credentials,
  onChanged,
}: {
  status: AiStatus;
  credentials: ProviderCredentialSummary[];
  /** Refetches status and credentials after a change. */
  onChanged: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Partial<Record<AiProviderId, string>>>({});
  const [busy, setBusy] = useState<AiProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!status.byokAvailable) {
    return <p className="settings-note">This server can’t store personal API keys.</p>;
  }

  const stored = new Map(credentials.map((entry) => [entry.provider, entry]));

  const save = async (event: FormEvent, provider: AiProviderId) => {
    event.preventDefault();
    const apiKey = drafts[provider]?.trim();
    if (!apiKey || busy) return;

    setBusy(provider);
    setError(null);
    try {
      await saveCredential(provider, apiKey);
      // Dropped as soon as it is stored; no reason to keep a key in state where
      // a later render could echo it.
      setDrafts((current) => ({ ...current, [provider]: "" }));
      await onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save that key");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (provider: AiProviderId) => {
    setBusy(provider);
    setError(null);
    try {
      await deleteCredential(provider);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not remove that key");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="keys">
      <p className="settings-note">
        With your own key, questions are billed to your account. Keys are encrypted and only used
        for your requests.
      </p>

      {status.providers.map((provider) => {
        const existing = stored.get(provider.id);

        return (
          <div className="key-row" key={provider.id}>
            <div className="key-row-head">
              <span className="key-row-name">{provider.label}</span>
              <span className="key-row-state">
                {existing ? "Your key" : provider.hasServerKey ? "Server key" : "No key"}
              </span>
            </div>

            {existing ? (
              <div className="key-row-stored">
                <code>{existing.hint}</code>
                <Button size="sm" variant="ghost" onClick={() => void remove(provider.id)} loading={busy === provider.id}>
                  Remove
                </Button>
              </div>
            ) : (
              <form className="key-row-form" onSubmit={(event) => void save(event, provider.id)}>
                <TextField
                  label={`${provider.label} API key`}
                  hideLabel
                  type="password"
                  value={drafts[provider.id] ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [provider.id]: event.target.value }))
                  }
                  placeholder="Paste a key"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy !== null}
                />
                <Button type="submit" size="md" loading={busy === provider.id} disabled={!(drafts[provider.id] ?? "").trim()}>
                  Save
                </Button>
              </form>
            )}

            <a className="key-row-link" href={KEY_PAGES[provider.id]} target="_blank" rel="noreferrer">
              Get a key from {provider.label}
            </a>
          </div>
        );
      })}

      {error && (
        <InlineAlert tone="error">
          <p>{error}</p>
        </InlineAlert>
      )}
    </div>
  );
}

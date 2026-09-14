import { useState, type FormEvent } from "react";
import {
  deleteCredential,
  saveCredential,
} from "../../api/credentials";
import { ApiError } from "../../api/client";
import type {
  AiProviderId,
  AiStatus,
  ProviderCredentialSummary,
} from "../../types";

interface KeyManagerProps {
  status: AiStatus;
  credentials: ProviderCredentialSummary[];
  /** Refetches status and credentials after a change. */
  onChanged: () => Promise<void>;
}

/** Where each provider's keys are issued, so the user knows where to go. */
const KEY_PAGES: Record<AiProviderId, string> = {
  gemini: "https://aistudio.google.com/apikey",
  openrouter: "https://openrouter.ai/keys",
};

/**
 * Lets a user store their own provider keys.
 *
 * Collapsed by default: most people will use the server's key, and a panel this
 * narrow should not lead with a settings form.
 */
export default function KeyManager({
  status,
  credentials,
  onChanged,
}: KeyManagerProps) {
  const [drafts, setDrafts] = useState<Partial<Record<AiProviderId, string>>>({});
  const [busy, setBusy] = useState<AiProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!status.byokAvailable) {
    return (
      <p className="model-picker-note">
        This server cannot store personal API keys.
      </p>
    );
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
      // Dropped as soon as it is stored; there is no reason to keep a key in
      // component state where a later render could echo it.
      setDrafts((current) => ({ ...current, [provider]: "" }));
      await onChanged();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "Could not save that key",
      );
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
      setError(
        cause instanceof ApiError ? cause.message : "Could not remove that key",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <details className="key-manager">
      <summary>Your API keys</summary>

      <p className="key-manager-intro">
        Use your own key and questions are billed to your account instead of
        this server's. Keys are encrypted and only ever used for your requests.
      </p>

      {status.providers.map((provider) => {
        const existing = stored.get(provider.id);

        return (
          <div className="key-manager-row" key={provider.id}>
            <div className="key-manager-head">
              <strong>{provider.label}</strong>
              <a href={KEY_PAGES[provider.id]} target="_blank" rel="noreferrer">
                Get a key
              </a>
            </div>

            {existing ? (
              <div className="key-manager-stored">
                <code>{existing.hint}</code>
                <button
                  type="button"
                  onClick={() => void remove(provider.id)}
                  disabled={busy !== null}
                >
                  Remove
                </button>
              </div>
            ) : (
              <form
                className="key-manager-form"
                onSubmit={(event) => void save(event, provider.id)}
              >
                <input
                  type="password"
                  value={drafts[provider.id] ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [provider.id]: event.target.value,
                    }))
                  }
                  placeholder={`Paste your ${provider.label} key`}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy !== null}
                />
                <button
                  type="submit"
                  disabled={
                    busy !== null || !(drafts[provider.id] ?? "").trim()
                  }
                >
                  {busy === provider.id ? "…" : "Save"}
                </button>
              </form>
            )}

            {!provider.hasServerKey && !existing && (
              <p className="model-picker-note">
                This server has no {provider.label} key, so it is unavailable
                until you add your own.
              </p>
            )}
          </div>
        );
      })}

      {error && (
        <p className="model-picker-note" data-kind="error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}

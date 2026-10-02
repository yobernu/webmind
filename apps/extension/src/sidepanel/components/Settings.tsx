import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import type { AuthUser } from "../../types";
import { Button, IconButton, InlineAlert } from "../../ui";
import type { AiState } from "../useAi";
import KeyManager from "./KeyManager";
import ModelPicker from "./ModelPicker";
import { PrivacyExplainer } from "./PrivacyPanel";

export type SettingsSection = "answers" | "keys" | "privacy" | "account";

/**
 * Account-level settings in one place, out of the reading flow: who answers,
 * the user's own keys, privacy and the account itself.
 */
export default function Settings({
  ai,
  user,
  initialSection,
  onClose,
  onSignOut,
  onDeleteAccount,
}: {
  ai: AiState;
  user: AuthUser | null;
  initialSection?: SettingsSection;
  onClose: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!initialSection) return;
    root.current
      ?.querySelector(`[data-section="${initialSection}"]`)
      ?.scrollIntoView({ block: "start" });
  }, [initialSection]);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onDeleteAccount();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The account could not be deleted");
      setDeleting(false);
    }
  };

  return (
    <div className="settings" ref={root}>
      <header className="view-header">
        <IconButton icon="back" label="Back to the workspace" onClick={onClose} />
        <h1 className="view-title">Settings</h1>
      </header>

      <section className="settings-section" data-section="answers" aria-labelledby="settings-answers">
        <h2 id="settings-answers" className="settings-heading">
          Answers
        </h2>
        {ai.status ? (
          <ModelPicker status={ai.status} onChange={ai.chooseProvider} />
        ) : (
          <p className="settings-note">Loading…</p>
        )}
      </section>

      <section className="settings-section" data-section="keys" aria-labelledby="settings-keys">
        <h2 id="settings-keys" className="settings-heading">
          Your API keys
        </h2>
        {ai.status && <KeyManager status={ai.status} credentials={ai.credentials} onChanged={ai.refresh} />}
      </section>

      <section className="settings-section" data-section="privacy" aria-labelledby="settings-privacy">
        <h2 id="settings-privacy" className="settings-heading">
          Privacy &amp; data
        </h2>
        <PrivacyExplainer />
      </section>

      <section className="settings-section" data-section="account" aria-labelledby="settings-account">
        <h2 id="settings-account" className="settings-heading">
          Account
        </h2>
        {user && (
          <div className="account-row">
            <div className="account-who">
              {user.name && <span className="account-name">{user.name}</span>}
              <span className="account-email">{user.email}</span>
            </div>
            <Button size="sm" icon="signOut" onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        )}

        <div className="danger-zone">
          <p className="danger-zone-title">Delete account</p>
          <p className="settings-note">
            Removes your account with every saved page, conversation, note, highlight and stored key.
            This can’t be undone.
          </p>
          {error && (
            <InlineAlert tone="error">
              <p>{error}</p>
            </InlineAlert>
          )}
          <div className="danger-zone-actions">
            {confirming ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
                  Keep my account
                </Button>
                <Button size="sm" variant="danger" onClick={() => void remove()} loading={deleting}>
                  Delete everything
                </Button>
              </>
            ) : (
              <Button size="sm" variant="danger" icon="trash" onClick={() => setConfirming(true)}>
                Delete account…
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

import { useState } from "react";
import { ApiError } from "../../api/client";

/**
 * What WebMind does with the pages it sees (SRS §7, §9.4). Shown once before
 * anything is sent, and again from the account bar, where the account can
 * also be deleted.
 */
export default function PrivacyPanel({
  acknowledged,
  onAcknowledge,
  onClose,
  onDeleteAccount,
}: {
  acknowledged: boolean;
  onAcknowledge: () => void;
  onClose: () => void;
  onDeleteAccount: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onDeleteAccount();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "The account could not be deleted",
      );
      setDeleting(false);
    }
  };

  return (
    <section className="privacy" aria-labelledby="privacy-title">
      <h2 id="privacy-title">How WebMind uses the pages you read</h2>

      <ul>
        <li>
          <strong>Only while this panel is open.</strong> Closing it stops WebMind
          reading or recording anything.
        </li>
        <li>
          <strong>The page you are on</strong> — its address, title and readable
          text — is saved to your WebMind account, so your chats, notes and
          highlights reconnect when you come back.
        </li>
        <li>
          <strong>When you ask a question</strong>, the relevant page text and your
          recent conversation are sent to the AI provider shown under the chat.
          Long pages are also indexed with Google’s embedding service to find the
          relevant parts.
        </li>
        <li>
          <strong>Your notes and highlights</strong> are stored with your account
          and are only visible to you.
        </li>
        <li>
          Page instructions never control the AI: page text is treated as material
          to answer from, not as commands.
        </li>
      </ul>

      {!acknowledged ? (
        <button type="button" className="privacy-primary" onClick={onAcknowledge}>
          I understand — start using WebMind
        </button>
      ) : (
        <>
          <div className="privacy-danger">
            <h3>Delete your data</h3>
            <p>
              Deletes your account with every saved page, conversation, note,
              highlight and stored API key. This cannot be undone.
            </p>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            {confirming ? (
              <div className="item-actions">
                <button type="button" onClick={() => setConfirming(false)} disabled={deleting}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => void remove()}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : "Delete everything"}
                </button>
              </div>
            ) : (
              <div className="item-actions">
                <button type="button" className="danger" onClick={() => setConfirming(true)}>
                  Delete my account
                </button>
              </div>
            )}
          </div>

          <button type="button" className="privacy-primary" onClick={onClose}>
            Back to the workspace
          </button>
        </>
      )}
    </section>
  );
}

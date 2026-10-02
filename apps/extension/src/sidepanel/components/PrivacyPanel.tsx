import { BrandMark, Button } from "../../ui";

/** What Gloss AI does with the pages it sees (SRS §7, §9.4). */
export function PrivacyExplainer() {
  return (
    <dl className="privacy-list">
      <div>
        <dt>Only while this panel is open</dt>
        <dd>Close it and Gloss stops reading or recording anything.</dd>
      </div>
      <div>
        <dt>The page you’re on</dt>
        <dd>
          Its address, title and readable text are saved to your account, so your chats, notes and
          highlights come back with it.
        </dd>
      </div>
      <div>
        <dt>When you ask</dt>
        <dd>
          The relevant page text and your recent conversation go to the AI provider named under the
          chat. Long pages are indexed with Google’s embedding service to find the right passages.
        </dd>
      </div>
      <div>
        <dt>Notes and highlights</dt>
        <dd>Stored with your account and visible only to you.</dd>
      </div>
      <div>
        <dt>Pages can’t steer the AI</dt>
        <dd>Page text is treated as material to answer from, never as instructions.</dd>
      </div>
    </dl>
  );
}

/** First run: shown before anything about a page is sent. */
export default function PrivacyPanel({ onAcknowledge }: { onAcknowledge: () => void }) {
  return (
    <section className="onboarding" aria-labelledby="onboarding-title">
      <BrandMark size={36} />
      <h1 id="onboarding-title" className="onboarding-title">
        Before Gloss reads a page
      </h1>
      <p className="onboarding-lede">Here is exactly what is collected and where it goes.</p>
      <PrivacyExplainer />
      <Button variant="primary" onClick={onAcknowledge}>
        Start reading with Gloss
      </Button>
      <p className="settings-note">You can review this, or delete everything, from Settings.</p>
    </section>
  );
}

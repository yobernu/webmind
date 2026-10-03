import { useState, type ReactNode } from "react";
import {
  Avatar,
  BrandLockup,
  BrandMark,
  Button,
  EmptyState,
  Entry,
  EntryList,
  IconButton,
  InlineAlert,
  Menu,
  Quote,
  Select,
  Spinner,
  Tabs,
  TextArea,
  TextButton,
  TextField,
  Toast,
  Wordmark,
} from "../ui";
import { LONG_QUOTE, LONG_URL, RTL_TEXT } from "./fixtures";
import "./gallery.css";
import PagePreview from "./PagePreview";
import StoreShot from "./StoreShot";
import { screens } from "./screens";

/**
 * The component gallery: every primitive and screen state, in light and dark,
 * at side-panel widths. It plays the role of the design file. Served by
 * `vite` at /gallery.html; not part of the extension build.
 *
 * Query parameters: ?width=360 sets the frame width, ?only=primitives|screens
 * limits what is shown (for screenshots).
 */
const params = new URLSearchParams(location.search);
const WIDTH = Number(params.get("width") ?? 360);
const ONLY = params.get("only");
const SCREEN = params.get("screen")?.toLowerCase();

function Frame({ theme, label, children }: { theme: "light" | "dark"; label: string; children: ReactNode }) {
  return (
    <div className="gallery-frame" data-theme={theme} style={{ width: WIDTH }}>
      <div className="gallery-frame-label">
        {label} · {theme}
      </div>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="gallery-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Primitives() {
  const [tab, setTab] = useState<"ask" | "notes" | "highlights" | "history">("notes");

  return (
    <>
      <Section title="Brand">
        <div className="gallery-row" style={{ gap: 16 }}>
          <BrandLockup height={18} />
          <BrandMark size={32} />
          <Wordmark height={26} />
        </div>
      </Section>

      <Section title="Buttons">
        <div className="gallery-row">
          <Button variant="primary">Save note</Button>
          <Button>Cancel</Button>
          <Button variant="ghost" icon="plus">
            New chat
          </Button>
          <Button variant="danger" icon="trash">
            Delete
          </Button>
        </div>
        <div className="gallery-row">
          <Button variant="primary" size="sm" loading>
            Saving
          </Button>
          <Button size="sm" icon="external">
            Get a key
          </Button>
          <Button size="sm" disabled>
            Disabled
          </Button>
          <IconButton icon="edit" label="Edit note" />
          <IconButton icon="trash" label="Delete note" />
          <IconButton icon="send" label="Ask" variant="solid" />
          <IconButton icon="stop" label="Stop answering" variant="solid" />
          <TextButton>Create an account</TextButton>
        </div>
      </Section>

      <Section title="Fields">
        <TextField label="Email" placeholder="you@example.com" type="email" />
        <TextField label="Password" type="password" defaultValue="hunter22" error="Use at least 8 characters." />
        <TextField label="Search" hideLabel icon="search" placeholder="Search your notes, chats and highlights" />
        <Select label="Provider" hint="Billed to this server's key.">
          <option>Anthropic Claude</option>
          <option>Google Gemini</option>
        </Select>
        <TextArea label="Note" hideLabel placeholder="Write a note about this page…" defaultValue="" />
      </Section>

      <Section title="Tabs">
        <Tabs
          idBase="gallery"
          label="Workspace"
          selected={tab}
          onSelect={setTab}
          items={[
            { id: "ask", label: "Ask" },
            { id: "notes", label: "Notes", count: 3 },
            { id: "highlights", label: "Highlights", count: 12 },
            { id: "history", label: "History" },
          ]}
        />
      </Section>

      <Section title="Entries">
        <EntryList>
          <Entry
            as="li"
            tone="highlight"
            meta="2 hours ago"
            actions={
              <>
                <IconButton size="sm" icon="ask" label="Ask about this" />
                <IconButton size="sm" icon="note" label="Add a note" />
                <IconButton size="sm" icon="trash" label="Remove highlight" />
              </>
            }
          >
            <Quote clamp={4}>{LONG_QUOTE}</Quote>
          </Entry>
          <Entry as="li" tone="note" meta="Yesterday · edited" pinActions actions={<Button size="sm" variant="danger">Delete note</Button>}>
            <p>Remember: a 404 still resolves. Check res.ok, not just the catch.</p>
          </Entry>
          <Entry as="li" tone="muted" meta="Not found on this version of the page">
            <Quote clamp={2}>{RTL_TEXT}</Quote>
          </Entry>
        </EntryList>
      </Section>

      <Section title="Feedback">
        <InlineAlert tone="error" action={<Button size="sm" variant="ghost" icon="retry">Try again</Button>}>
          <p>The answer could not be completed. Your question was saved.</p>
        </InlineAlert>
        <InlineAlert tone="warning">
          <p>This server has no Anthropic key.</p>
          <p>Add your own key to use Claude.</p>
        </InlineAlert>
        <InlineAlert>
          <p style={{ overflowWrap: "anywhere" }}>{LONG_URL}</p>
        </InlineAlert>
        <EmptyState title="No notes yet" action={<Button size="sm" icon="plus">Add a note</Button>}>
          Select text on the page and choose Add note to quote it.
        </EmptyState>
        <div className="gallery-row">
          <Spinner />
          <Avatar name="yobernu@gmail.com" />
          <Avatar name="Ada Lovelace" size={28} />
          <Menu
            label="Account"
            trigger={<Avatar name="Ada Lovelace" />}
            header="ada@example.com"
            items={[
              { label: "Settings", icon: "settings", onSelect: () => {} },
              { label: "Privacy & data", icon: "lock", onSelect: () => {} },
              { label: "Sign out", icon: "signOut", onSelect: () => {}, separated: true },
            ]}
          />
        </div>
        <div style={{ position: "relative", height: 52 }}>
          <Toast>Highlight saved</Toast>
        </div>
      </Section>
    </>
  );
}

export default function Gallery() {
  if (ONLY === "store") {
    return <StoreShot index={Number(params.get("shot") ?? 0)} />;
  }

  if (ONLY === "page") {
    return (
      <div className="gallery">
        <PagePreview dark={matchMedia("(prefers-color-scheme: dark)").matches} />
      </div>
    );
  }

  return (
    <div className="gallery">
      {ONLY !== "screens" &&
        (["light", "dark"] as const).map((theme) => (
          <Frame key={`primitives-${theme}`} theme={theme} label="Primitives">
            <Primitives />
          </Frame>
        ))}
      {ONLY !== "primitives" &&
        screens
          .filter(({ name }) => !SCREEN || name.toLowerCase().includes(SCREEN))
          .flatMap(({ name, render }) =>
          (["light", "dark"] as const).map((theme) => (
            <Frame key={`${name}-${theme}`} theme={theme} label={name}>
              <div className="gallery-screen">{render()}</div>
            </Frame>
          )),
        )}
    </div>
  );
}


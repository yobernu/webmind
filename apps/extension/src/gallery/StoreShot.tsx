import type { ReactNode } from "react";
import { BrandLockup } from "../ui";
import PagePreview from "./PagePreview";
import { screens } from "./screens";

/**
 * Listing screenshots for addons.mozilla.org and the Chrome Web Store
 * (1280×800). Composed from the real components and the real page painter,
 * so they show the product as it is.
 */
const SHOTS: { headline: string; body: string; screen: string; page?: boolean }[] = [
  {
    headline: "Ask about the page you’re reading",
    body: "Select a passage and ask. Answers come from the page itself, set as readable prose.",
    screen: "Ask · conversation",
    page: true,
  },
  {
    headline: "Highlights that come back when you do",
    body: "Save a passage and it’s marked again on your next visit, even after the page shifts.",
    screen: "Highlights",
    page: true,
  },
  {
    headline: "Notes that stay with the page",
    body: "Quote a passage, write your thought, and find it beside the same page later.",
    screen: "Notes",
  },
  {
    headline: "Find anything you’ve saved",
    body: "Search every note, conversation and highlight, and jump straight back to the source.",
    screen: "History",
  },
];

function panel(name: string): ReactNode {
  return screens.find((screen) => screen.name === name)?.render() ?? null;
}

export default function StoreShot({ index }: { index: number }) {
  const shot = SHOTS[Math.min(Math.max(index, 0), SHOTS.length - 1)];

  return (
    <div className="store">
      <div className="store-copy">
        <BrandLockup height={22} />
        <h1 className="store-headline">{shot.headline}</h1>
        <p className="store-body">{shot.body}</p>
      </div>
      <div className="store-stage" data-page={shot.page || undefined}>
        {shot.page && (
          <div className="store-page">
            <PagePreview dark={false} />
          </div>
        )}
        <div className="store-panel">
          <div className="gallery-screen">{panel(shot.screen)}</div>
        </div>
      </div>
    </div>
  );
}

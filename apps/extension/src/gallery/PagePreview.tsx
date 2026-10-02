import { useEffect, useRef } from "react";
import { paintHighlights, scrollToHighlight } from "../content/highlighter";
import { createSelectionToolbar } from "../content/toolbar";
import { buildTextIndex, describeRange } from "../utils/anchor";

/**
 * A stand-in web page running the real content-script modules: the selection
 * toolbar shown under a selection, and saved highlights painted with the CSS
 * Custom Highlight API. Its colour scheme follows the browser's.
 */
export default function PagePreview({ dark }: { dark: boolean }) {
  const article = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = article.current;
    if (!root) return;

    const paragraphs = root.querySelectorAll("p");
    const pick = (paragraph: Element, text: string) => {
      const node = paragraph.firstChild as Text;
      const start = node.data.indexOf(text);
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      return range;
    };

    const index = buildTextIndex(document.body);
    const saved = describeRange(pick(paragraphs[0], "returning a promise that is fulfilled"), index);
    const active = describeRange(pick(paragraphs[1], "does not reject on HTTP error status"), index);
    paintHighlights([
      { id: "a", selector: saved, selectedText: "" },
      { id: "b", selector: active, selectedText: "" },
    ]);
    scrollToHighlight("b");

    const selection = pick(paragraphs[2], "check the Response.ok property");
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(selection);
    const toolbar = createSelectionToolbar(() => {});
    toolbar.show(selection.getBoundingClientRect());
    return () => toolbar.hide();
  }, []);

  return (
    <article ref={article} className="page-preview" data-dark={dark || undefined}>
      <h1>Window: fetch() method</h1>
      <p>The fetch() method starts the process of fetching a resource from the network, returning a promise that is fulfilled once the response is available.</p>
      <p>A fetch() promise only rejects when the request fails. It does not reject on HTTP error status codes such as 404 or 504.</p>
      <p>Instead, a then() handler must check the Response.ok property and the Response.status property before reading the body.</p>
    </article>
  );
}

import { Fragment, type ReactNode } from "react";
import { parseBlocks, renderInline } from "./proseParse";

/** Renders a model answer as typeset prose; see proseParse for the subset. */
export function Prose({ text, trailing }: { text: string; trailing?: ReactNode }) {
  const blocks = parseBlocks(text);
  return (
    <div className="prose">
      {blocks.map((block, index) => {
        const last = index === blocks.length - 1;
        const tail = last ? trailing : null;
        if (block.kind === "code") {
          return (
            <Fragment key={index}>
              <pre className="prose-code">
                <code>{block.text}</code>
              </pre>
              {tail}
            </Fragment>
          );
        }
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  {renderInline(item)}
                  {last && itemIndex === block.items.length - 1 && tail}
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={index}>
            {renderInline(block.text)}
            {tail}
          </p>
        );
      })}
      {blocks.length === 0 && trailing}
    </div>
  );
}

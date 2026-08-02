"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { Fragment } from "react";

function renderMath(source: string, displayMode: boolean, key: string) {
  try {
    const html = katex.renderToString(source, { throwOnError: false, displayMode });
    return <span key={key} dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return <span key={key}>{source}</span>;
  }
}

// Splits on $$...$$ (display) then $...$ (inline) and renders math segments with KaTeX,
// leaving everything else as plain text. Good enough for model-generated LaTeX-in-prose.
export function KatexText({ text }: { text: string }) {
  const blocks = text.split(/(\$\$[^$]+\$\$)/g);
  return (
    <>
      {blocks.map((block, i) => {
        if (block.startsWith("$$") && block.endsWith("$$")) {
          return renderMath(block.slice(2, -2), true, `block-${i}`);
        }
        const inline = block.split(/(\$[^$]+\$)/g);
        return (
          <Fragment key={`frag-${i}`}>
            {inline.map((part, j) => {
              if (part.startsWith("$") && part.endsWith("$") && part.length > 1) {
                return renderMath(part.slice(1, -1), false, `inline-${i}-${j}`);
              }
              return (
                <span key={`text-${i}-${j}`} style={{ whiteSpace: "pre-wrap" }}>
                  {part}
                </span>
              );
            })}
          </Fragment>
        );
      })}
    </>
  );
}
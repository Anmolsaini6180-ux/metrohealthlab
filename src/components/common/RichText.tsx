import { Fragment } from "react";

/**
 * Renders admin-authored plain text as paragraphs/line breaks safely —
 * no dangerouslySetInnerHTML, so there is no sanitization to get
 * wrong. Splits on a blank line for paragraphs, single newlines
 * within a paragraph become <br />.
 */
export default function RichText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ marginBottom: i < paragraphs.length - 1 ? "var(--space-sm)" : 0 }}>
          {p.split("\n").map((line, j, arr) => (
            <Fragment key={j}>
              {line}
              {j < arr.length - 1 && <br />}
            </Fragment>
          ))}
        </p>
      ))}
    </>
  );
}

/**
 * Clean a Printify-stored description into readable plain text.
 *
 * Some catalog descriptions arrive from the supplier as HTML fragments
 * (`<p>`, `<strong>`, `<br>`). Rendering those raw inside the PDP text block
 * would show literal tags to customers, and they would leak into the `<meta
 * name="description">` and JSON-LD. Everything downstream consumes the cleaned
 * form produced here.
 */
export function toPlainText(raw: string): string {
  if (!raw) return "";
  return (
    raw
      // Block-level tags (open and close) become paragraph breaks.
      .replace(/<\/?(?:p|div|li|ul|ol|h[1-6]|blockquote|tr)[^>]*>/gi, "\n")
      // Line breaks become newlines.
      .replace(/<br\s*\/?>/gi, "\n")
      // Anything else is stripped.
      .replace(/<[^>]*>/g, "")
      // Common HTML entities.
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#0?39;|&apos;/gi, "'")
      .replace(/&rsquo;/gi, "’")
      .replace(/&lsquo;/gi, "‘")
      .replace(/&ndash;/gi, "–")
      .replace(/&mdash;/gi, "—")
      // Normalise spacing: per-line trim, then collapse runs of blank lines.
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim()
  );
}
/**
 * Build a concise meta description from a supplier/product description.
 * Uses the first sentence when it fits, otherwise trims at a word boundary and
 * appends an ellipsis. Returns the trimmed text (never fabricates copy).
 */
export function metaDescription(raw: string, max = 155): string {
  const text = toPlainText(raw).replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;

  const cut = text.slice(0, max);
  const sentenceEnd = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
  );
  if (sentenceEnd >= Math.floor(max * 0.6)) {
    return text.slice(0, sentenceEnd + 1).trim();
  }

  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[,;:\-–—]+$/, "").trim()}…`;
}

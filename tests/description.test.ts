import { describe, expect, it } from "vitest";

import { metaDescription, toPlainText } from "@/lib/catalog/description";

describe("toPlainText", () => {
  it("strips block tags into paragraph breaks", () => {
    const html =
      "<p>First paragraph.</p><p>Second paragraph with <strong>bold</strong> text.</p>";
    expect(toPlainText(html)).toBe(
      "First paragraph.\n\nSecond paragraph with bold text.",
    );
  });

  it("converts <br> variants to newlines", () => {
    expect(toPlainText("Line one<br/>Line two<br>Line three")).toBe(
      "Line one\nLine two\nLine three",
    );
  });

  it("decodes common HTML entities", () => {
    expect(toPlainText("Fish &amp; chips &quot;quote&quot; don&rsquo;t")).toBe(
      "Fish & chips \"quote\" don’t",
    );
  });

  it("handles mixed Printify fragments", () => {
    const raw =
      "100% cotton canvas<br/>Heavy fabric<br/><p>Available in natural and black colors</p>";
    expect(toPlainText(raw)).toBe(
      "100% cotton canvas\nHeavy fabric\n\nAvailable in natural and black colors",
    );
  });

  it("collapses 3+ blank lines to at most two", () => {
    expect(toPlainText("a<br/><br/><br/><br/>b")).toBe("a\n\nb");
  });

  it("trims surrounding whitespace and normalises line-internal whitespace", () => {
    expect(toPlainText("  \n  padded\n  lines  \n ")).toBe("padded\nlines");
  });

  it("returns empty string for falsy input", () => {
    expect(toPlainText("")).toBe("");
    expect(toPlainText(undefined as unknown as string)).toBe("");
  });
});
describe("metaDescription", () => {
  it("returns short text unchanged", () => {
    expect(metaDescription("A simple cotton tee.")).toBe("A simple cotton tee.");
  });

  it("uses the first full sentence when it fits within the limit", () => {
    const text =
      "A lightweight, breathable tee that says what you mean without shouting. More detail follows here.";
    expect(metaDescription(text, 80)).toBe(
      "A lightweight, breathable tee that says what you mean without shouting.",
    );
  });

  it("trims long single-sentence text at a word boundary with an ellipsis", () => {
    const text = "word ".repeat(60).trim();
    const out = metaDescription(text, 80);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(101);
    expect(out).not.toMatch(/\s…$/);
  });

  it("returns empty string for empty input", () => {
    expect(metaDescription("")).toBe("");
  });
});

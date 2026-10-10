import { describe, expect, it } from "vitest";
import { enforceTweetLimit } from "../src/generate.js";

const URL = "https://dataannotation.tech/?ref=YOUR_REF_CODE";

describe("enforceTweetLimit", () => {
  it("leaves compliant posts untouched", () => {
    const t = ["first post", "second post"];
    expect(enforceTweetLimit(t)).toEqual(t);
  });

  it("splits an overlong post at word boundaries", () => {
    const long = "word ".repeat(80).trim(); // ~400 chars
    const out = enforceTweetLimit([long]);
    expect(out.length).toBeGreaterThan(1);
    for (const p of out) expect(p.length).toBeLessThanOrEqual(280);
    expect(out.join(" ").replace(/\s+/g, " ")).toContain("word");
  });

  it("never splits a URL across posts", () => {
    const post = "a".repeat(270) + " " + URL + " tail";
    const out = enforceTweetLimit([post]);
    for (const p of out) {
      expect(p.length).toBeLessThanOrEqual(280);
      if (p.includes("http")) expect(p).toContain(URL);
    }
    expect(out.some((p) => p.includes(URL))).toBe(true);
  });

  it("never splits a trailing URL (Devin Review regression)", () => {
    // URL as last token with no following space must not be cut mid-link.
    const post = "Intro text " + "filler ".repeat(35) + URL;
    const out = enforceTweetLimit([post]);
    for (const p of out) expect(p.length).toBeLessThanOrEqual(280);
    const withUrl = out.filter((p) => p.includes("http"));
    expect(withUrl).toHaveLength(1);
    expect(withUrl[0]).toContain(URL);
  });

  it("drops a URL that cannot fit in any post", () => {
    const post = "x".repeat(200) + " https://example.com/" + "y".repeat(300);
    const out = enforceTweetLimit([post]);
    for (const p of out) {
      expect(p.length).toBeLessThanOrEqual(280);
      expect(p).not.toContain("http"); // no broken link survives
    }
  });

  it("truncates a pathological over-limit non-URL token", () => {
    const out = enforceTweetLimit(["z".repeat(400)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.length).toBe(280);
    expect(out[0]!.endsWith("…")).toBe(true);
  });
});

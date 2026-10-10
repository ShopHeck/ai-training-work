import { describe, expect, it } from "vitest";
import { enforceTweetLimit } from "../src/generate.js";

const URL = "https://dataannotation.tech/?ref=YOUR_REF_CODE";

describe("enforceTweetLimit", () => {
  it("leaves compliant posts untouched", () => {
    const t = ["first post", "second post"];
    expect(enforceTweetLimit(t)).toEqual(t);
  });

  it("splits an overlong post at a word boundary", () => {
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

  it("terminates on pathological input (URL longer than the limit)", () => {
    const post = "x".repeat(200) + " https://example.com/" + "y".repeat(300);
    const out = enforceTweetLimit([post]);
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) expect(p.length).toBeLessThanOrEqual(280);
  });
});

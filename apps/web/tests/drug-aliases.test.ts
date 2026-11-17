import { describe, expect, it } from "vitest";
import { aliasFor } from "../lib/drug-aliases";

describe("catalogue aliases", () => {
  it("maps the British name to the catalogue's US ingredient name", () => {
    expect(aliasFor("paracetamol")).toBe("acetaminophen");
    expect(aliasFor("Amoxycillin")).toBe("amoxicillin");
    expect(aliasFor("frusemide")).toBe("furosemide");
  });

  it("matches across case and surrounding whitespace", () => {
    expect(aliasFor("  Paracetamol  ")).toBe("acetaminophen");
  });

  it("returns null for a name it does not know", () => {
    expect(aliasFor("ibuprofen")).toBeNull();
    expect(aliasFor("")).toBeNull();
  });
});

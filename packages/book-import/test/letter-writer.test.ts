import { describe, expect, it } from "bun:test";
import { isWritersLetter } from "../src/letter-writer";

const marx = {
  signatures: ["K. M.", "Karl Marx."],
  salutations: ["Lieber Engels!", "Dear Frederick!"],
};

describe("isWritersLetter", () => {
  it("knows the writer's letter by the signature, its closing words and brackets left out", () => {
    expect(
      isWritersLetter({ salutation: null, signatures: ["Dein K. M."] }, marx),
    ).toBe(true);
    expect(
      isWritersLetter({ salutation: null, signatures: ["[Karl Marx]"] }, marx),
    ).toBe(true);
    expect(
      isWritersLetter(
        { salutation: "Lieber Engels!", signatures: ["Dein F. E."] },
        marx,
      ),
    ).toBe(false);
  });

  it("knows an unsigned letter by the salutation, an editors' bracketed remark no signature", () => {
    expect(
      isWritersLetter({ salutation: "Dear Frederick!", signatures: [] }, marx),
    ).toBe(true);
    expect(
      isWritersLetter(
        { salutation: "Lieber Engels!", signatures: ["[Schluß fehlt.]"] },
        marx,
      ),
    ).toBe(true);
    expect(
      isWritersLetter({ salutation: "Lieber Mohr!", signatures: [] }, marx),
    ).toBe(false);
  });

  it("takes a signature in quotation marks for one the letter quotes", () => {
    expect(
      isWritersLetter(
        { salutation: "Lieber Mohr!", signatures: ["K. M.“"] },
        marx,
      ),
    ).toBe(false);
  });
});

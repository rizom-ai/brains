import { describe, expect, it } from "bun:test";
import { inOrder, peerOf } from "../src/lib/peers";

describe("a peer as a seminar names him", () => {
  it("goes by the name the owner shows him under in the directory", () => {
    expect(
      peerOf({
        id: "karl.example",
        metadata: { name: "Karl", shownAs: "Marx", status: "approved" },
      }),
    ).toEqual({ id: "karl.example", name: "Marx" });
  });

  it("goes by his own name where the owner gave none", () => {
    expect(peerOf({ id: "karl.example", metadata: { name: "Karl" } })).toEqual({
      id: "karl.example",
      name: "Karl",
    });
  });
});

describe("the peers in the brain's order", () => {
  const peers = [
    { id: "friedrich.example", name: "Nietzsche" },
    { id: "karl.example", name: "Marx" },
    { id: "sigmund.example", name: "Freud" },
  ];

  it("puts the listed peers first, as listed, and the others after by id", () => {
    expect(
      inOrder(peers, ["sigmund.example", "karl.example"]).map(
        ({ name }) => name,
      ),
    ).toEqual(["Freud", "Marx", "Nietzsche"]);
  });

  it("is by id on a brain that orders none", () => {
    expect(inOrder(peers, []).map(({ name }) => name)).toEqual([
      "Nietzsche",
      "Marx",
      "Freud",
    ]);
  });
});

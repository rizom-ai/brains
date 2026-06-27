import { describe, expect, it } from "bun:test";
import { WishlistPlugin } from "../src/index";

class TestWishlistPlugin extends WishlistPlugin {
  public instructions(): Promise<string> {
    return this.getInstructions();
  }
}

describe("WishlistPlugin instructions", () => {
  it("tells models to list the whole wishlist without status fanout", async () => {
    const instructions = await new TestWishlistPlugin().instructions();

    expect(instructions).toContain(
      "To show the whole wishlist, call system_list once with entityType wish and omit status",
    );
  });
});

import { describe, expect, it } from "bun:test";
import { productsTemplate } from "../src/sections/products";

describe("productsTemplate", () => {
  it("loads the mini-canvas runtime script on routes that render products", () => {
    expect(productsTemplate.runtimeScripts).toEqual([
      { src: "/canvases/products.canvas.js", defer: true },
    ]);
  });
});

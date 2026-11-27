import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { afterEach, beforeEach, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { readDensity, storeDensity } from "./use-density-preference";

let windowInstance: Window;
let restore: RestoreGlobals;

beforeEach(() => {
  windowInstance = new Window();
  restore = installDomGlobals(windowInstance, {
    localStorage: windowInstance.localStorage,
  });
});

afterEach(() => {
  windowInstance.close();
  restore();
});

it("keeps the chosen density in this browser, comfortable until chosen", () => {
  expect(readDensity()).toBe("comfortable");
  storeDensity("compact");
  expect(localStorage.getItem("studio.density")).toBe("compact");
  expect(readDensity()).toBe("compact");
  storeDensity("comfortable");
  expect(localStorage.getItem("studio.density")).toBeNull();
  localStorage.setItem("studio.density", "dense");
  expect(readDensity()).toBe("comfortable");
});

import { describe, it, expect } from "bun:test";
import { paginateItems } from "./pagination";

describe("paginateItems", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

  it("returns all items when no options specified", () => {
    const result = paginateItems(items, {});

    expect(result.items).toEqual(items);
    expect(result.pagination).toBeNull();
  });

  it("returns first N items when only limit specified", () => {
    const result = paginateItems(items, { limit: 3 });

    expect(result.items).toEqual(["a", "b", "c"]);
    expect(result.pagination).toBeNull();
  });

  it("returns paginated results when page specified", () => {
    const result = paginateItems(items, { page: 1, pageSize: 3 });

    expect(result.items).toEqual(["a", "b", "c"]);
    expect(result.pagination).toEqual({
      currentPage: 1,
      totalPages: 4,
      totalItems: 10,
      pageSize: 3,
      hasNextPage: true,
      hasPrevPage: false,
    });
  });

  it("returns correct page for middle pages", () => {
    const result = paginateItems(items, { page: 2, pageSize: 3 });

    expect(result.items).toEqual(["d", "e", "f"]);
    expect(result.pagination).toEqual({
      currentPage: 2,
      totalPages: 4,
      totalItems: 10,
      pageSize: 3,
      hasNextPage: true,
      hasPrevPage: true,
    });
  });

  it("returns correct page for last page", () => {
    const result = paginateItems(items, { page: 4, pageSize: 3 });

    expect(result.items).toEqual(["j"]);
    expect(result.pagination).toEqual({
      currentPage: 4,
      totalPages: 4,
      totalItems: 10,
      pageSize: 3,
      hasNextPage: false,
      hasPrevPage: true,
    });
  });

  it("uses limit as pageSize fallback when page specified", () => {
    const result = paginateItems(items, { page: 1, limit: 5 });

    expect(result.items).toEqual(["a", "b", "c", "d", "e"]);
    expect(result.pagination?.pageSize).toBe(5);
    expect(result.pagination?.totalPages).toBe(2);
  });

  it("handles empty items array", () => {
    const result = paginateItems([], { page: 1, pageSize: 10 });

    expect(result.items).toEqual([]);
    expect(result.pagination).toEqual({
      currentPage: 1,
      totalPages: 0,
      totalItems: 0,
      pageSize: 10,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });
});

import { describe, it, expect } from "bun:test";
import { UnsplashClient } from "../src/lib/unsplash-client";

type FetchFn = (
  url: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function mockFetch(response: object, status = 200): FetchFn {
  return async () =>
    new Response(JSON.stringify(response), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

const unsplashPhoto = {
  id: "abc123",
  description: "A mountain landscape",
  alt_description: "Snow-capped mountains at sunset",
  urls: {
    raw: "https://images.unsplash.com/photo-abc123?raw",
    full: "https://images.unsplash.com/photo-abc123?full",
    regular: "https://images.unsplash.com/photo-abc123?w=1080",
    small: "https://images.unsplash.com/photo-abc123?w=400",
    thumb: "https://images.unsplash.com/photo-abc123?w=200",
  },
  links: {
    html: "https://unsplash.com/photos/abc123",
    download_location:
      "https://api.unsplash.com/photos/abc123/download?ixid=123",
  },
  user: {
    name: "Jane Smith",
    links: { html: "https://unsplash.com/@janesmith" },
  },
  width: 4000,
  height: 3000,
};

describe("UnsplashClient", () => {
  describe("searchPhotos", () => {
    it("should return mapped photo candidates", async () => {
      const fetchFn = mockFetch({
        total: 100,
        total_pages: 10,
        results: [unsplashPhoto],
      });

      const client = new UnsplashClient("test-key", fetchFn);
      const result = await client.searchPhotos("mountains", {
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(100);
      expect(result.totalPages).toBe(10);
      expect(result.page).toBe(1);
      expect(result.photos).toHaveLength(1);

      const photo = result.photos[0];
      expect(photo).toBeDefined();
      if (!photo) return;
      expect(photo.id).toBe("abc123");
      expect(photo.description).toBe("A mountain landscape");
      expect(photo.altDescription).toBe("Snow-capped mountains at sunset");
      expect(photo.thumbnailUrl).toBe(unsplashPhoto.urls.thumb);
      expect(photo.imageUrl).toBe(unsplashPhoto.urls.regular);
      expect(photo.photographerName).toBe("Jane Smith");
      expect(photo.photographerUrl).toBe("https://unsplash.com/@janesmith");
      expect(photo.sourceUrl).toBe("https://unsplash.com/photos/abc123");
      expect(photo.downloadLocation).toBe(
        unsplashPhoto.links.download_location,
      );
      expect(photo.width).toBe(4000);
      expect(photo.height).toBe(3000);
    });

    it("should send Authorization header with API key", async () => {
      let capturedHeaders: Headers | undefined;
      const fetchFn: FetchFn = async (_url, init) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(
          JSON.stringify({ total: 0, total_pages: 0, results: [] }),
        );
      };

      const client = new UnsplashClient("my-api-key", fetchFn);
      await client.searchPhotos("test", { page: 1, perPage: 5 });

      expect(capturedHeaders?.get("Authorization")).toBe(
        "Client-ID my-api-key",
      );
    });

    it("should pass query, page, and perPage as URL params", async () => {
      let capturedUrl = "";
      const fetchFn: FetchFn = async (url) => {
        capturedUrl = String(url);
        return new Response(
          JSON.stringify({ total: 0, total_pages: 0, results: [] }),
        );
      };

      const client = new UnsplashClient("key", fetchFn);
      await client.searchPhotos("ocean waves", { page: 3, perPage: 15 });

      const parsed = new URL(capturedUrl);
      expect(parsed.searchParams.get("query")).toBe("ocean waves");
      expect(parsed.searchParams.get("page")).toBe("3");
      expect(parsed.searchParams.get("per_page")).toBe("15");
    });

    it("should throw on non-OK response", async () => {
      const fetchFn = mockFetch({ errors: ["Rate limit"] }, 403);
      const client = new UnsplashClient("key", fetchFn);

      expect(
        client.searchPhotos("test", { page: 1, perPage: 10 }),
      ).rejects.toThrow("Unsplash API error: 403");
    });

    it("should handle empty results", async () => {
      const fetchFn = mockFetch({ total: 0, total_pages: 0, results: [] });
      const client = new UnsplashClient("key", fetchFn);

      const result = await client.searchPhotos("xyznonexistent", {
        page: 1,
        perPage: 10,
      });

      expect(result.total).toBe(0);
      expect(result.photos).toHaveLength(0);
    });
  });

  describe("triggerDownload", () => {
    it("should call the download location URL", async () => {
      let capturedUrl = "";
      const fetchFn: FetchFn = async (url) => {
        capturedUrl = String(url);
        return new Response(JSON.stringify({ url: "https://download.url" }));
      };

      const client = new UnsplashClient("key", fetchFn);
      await client.triggerDownload(
        "https://api.unsplash.com/photos/abc/download",
      );

      expect(capturedUrl).toBe("https://api.unsplash.com/photos/abc/download");
    });

    it("should not throw on network error", async () => {
      const fetchFn: FetchFn = async () => {
        throw new Error("Network error");
      };

      const client = new UnsplashClient("key", fetchFn);
      // Should not throw
      await client.triggerDownload(
        "https://api.unsplash.com/photos/abc/download",
      );
    });
  });
});

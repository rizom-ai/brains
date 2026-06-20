import { z } from "@brains/utils/zod-v4";
import type {
  StockPhotoProvider,
  SearchResult,
  PhotoCandidate,
  FetchFn,
} from "./types";

/**
 * Unsplash API client implementing StockPhotoProvider.
 */
export class UnsplashClient implements StockPhotoProvider {
  private readonly apiKey: string;
  private readonly fetchFn: FetchFn;
  private readonly baseUrl = "https://api.unsplash.com";

  constructor(apiKey: string, fetchFn: FetchFn) {
    this.apiKey = apiKey;
    this.fetchFn = fetchFn;
  }

  async searchPhotos(
    query: string,
    options: { page: number; perPage: number },
  ): Promise<SearchResult> {
    const url = new URL(`${this.baseUrl}/search/photos`);
    url.searchParams.set("query", query);
    url.searchParams.set("page", String(options.page));
    url.searchParams.set("per_page", String(options.perPage));

    const response = await this.fetchFn(url.toString(), {
      headers: {
        Authorization: `Client-ID ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Unsplash API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = unsplashSearchResponseSchema.parse(await response.json());

    return {
      photos: data.results.map(toPhotoCandidate),
      total: data.total,
      totalPages: data.total_pages,
      page: options.page,
    };
  }

  async triggerDownload(downloadLocation: string): Promise<void> {
    try {
      await this.fetchFn(downloadLocation, {
        headers: {
          Authorization: `Client-ID ${this.apiKey}`,
        },
      });
    } catch {
      // Fire-and-forget per Unsplash ToS
    }
  }
}

// -- Unsplash API response schemas (internal) --

const unsplashPhotoSchema = z.looseObject({
  id: z.string(),
  description: z.string().nullable(),
  alt_description: z.string().nullable(),
  urls: z.looseObject({
    raw: z.url(),
    full: z.url(),
    regular: z.url(),
    small: z.url(),
    thumb: z.url(),
  }),
  links: z.looseObject({
    html: z.url(),
    download_location: z.url(),
  }),
  user: z.looseObject({
    name: z.string(),
    links: z.looseObject({
      html: z.url(),
    }),
  }),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
});

const unsplashSearchResponseSchema = z.looseObject({
  total: z.number().int().nonnegative(),
  total_pages: z.number().int().nonnegative(),
  results: z.array(unsplashPhotoSchema),
});

type UnsplashPhoto = z.output<typeof unsplashPhotoSchema>;

function toPhotoCandidate(photo: UnsplashPhoto): PhotoCandidate {
  return {
    id: photo.id,
    description: photo.description,
    altDescription: photo.alt_description,
    thumbnailUrl: photo.urls.thumb,
    imageUrl: photo.urls.regular,
    photographerName: photo.user.name,
    photographerUrl: photo.user.links.html,
    sourceUrl: photo.links.html,
    downloadLocation: photo.links.download_location,
    width: photo.width,
    height: photo.height,
  };
}

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

    const data = (await response.json()) as UnsplashSearchResponse;

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

// -- Unsplash API response types (internal) --

interface UnsplashPhoto {
  id: string;
  description: string | null;
  alt_description: string | null;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  links: {
    html: string;
    download_location: string;
  };
  user: {
    name: string;
    links: {
      html: string;
    };
  };
  width: number;
  height: number;
}

interface UnsplashSearchResponse {
  total: number;
  total_pages: number;
  results: UnsplashPhoto[];
}

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

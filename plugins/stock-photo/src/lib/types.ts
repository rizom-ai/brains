export type FetchFn = (
  url: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type FetchImageFn = (url: string) => Promise<string>;

/**
 * A photo candidate returned from a stock photo search.
 */
export interface PhotoCandidate {
  id: string;
  description: string | null;
  altDescription: string | null;
  thumbnailUrl: string;
  imageUrl: string;
  photographerName: string;
  photographerUrl: string;
  sourceUrl: string;
  downloadLocation: string;
  width: number;
  height: number;
}

/**
 * Search result from a stock photo provider.
 */
export interface SearchResult {
  photos: PhotoCandidate[];
  total: number;
  totalPages: number;
  page: number;
}

/**
 * Result from selecting a stock photo.
 */
export interface SelectResult {
  imageEntityId: string;
  alreadyExisted: boolean;
  attribution: {
    photographerName: string;
    photographerUrl: string;
    sourceUrl: string;
  };
  coverSet?: true;
}

/**
 * Provider interface for stock photo services.
 */
export interface StockPhotoProvider {
  searchPhotos(
    query: string,
    options: { page: number; perPage: number },
  ): Promise<SearchResult>;
  triggerDownload(downloadLocation: string): Promise<void>;
}

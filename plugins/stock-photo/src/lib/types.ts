import { z } from "@brains/utils/zod";

export type FetchFn = (
  url: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** Fetches an image and returns it as a data URL. */
export type FetchImageFn = (url: string) => Promise<string>;

/** A photo candidate returned from a stock photo search. */
export const photoCandidateSchema: z.ZodObject<{
  id: z.ZodString;
  description: z.ZodNullable<z.ZodString>;
  altDescription: z.ZodNullable<z.ZodString>;
  thumbnailUrl: z.ZodString;
  imageUrl: z.ZodString;
  photographerName: z.ZodString;
  photographerUrl: z.ZodString;
  sourceUrl: z.ZodString;
  downloadLocation: z.ZodString;
  width: z.ZodNumber;
  height: z.ZodNumber;
}> = z.object({
  id: z.string(),
  description: z.string().nullable(),
  altDescription: z.string().nullable(),
  thumbnailUrl: z.string(),
  imageUrl: z.string(),
  photographerName: z.string(),
  photographerUrl: z.string(),
  sourceUrl: z.string(),
  downloadLocation: z.string(),
  width: z.number(),
  height: z.number(),
});

export type PhotoCandidate = z.output<typeof photoCandidateSchema>;

/** Search result from a stock photo provider. */
export const searchResultSchema: z.ZodObject<{
  photos: z.ZodArray<typeof photoCandidateSchema>;
  total: z.ZodNumber;
  totalPages: z.ZodNumber;
  page: z.ZodNumber;
}> = z.object({
  photos: z.array(photoCandidateSchema),
  total: z.number(),
  totalPages: z.number(),
  page: z.number(),
});

export type SearchResult = z.output<typeof searchResultSchema>;

/** Provider interface for stock photo services. */
export interface StockPhotoProvider {
  searchPhotos(
    query: string,
    options: { page: number; perPage: number },
  ): Promise<SearchResult>;
  triggerDownload(downloadLocation: string): Promise<void>;
}

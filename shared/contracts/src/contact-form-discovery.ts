import { z } from "@brains/utils/zod";

/** Presentation metadata only, never HTTP handlers or proof of live readiness.
 * Named consumer: professional-site builds in a separate worker process. */
export interface ContactFormDiscovery {
  origin: string;
  routes: {
    path: "/contact" | "/contact/thanks";
    method: "GET" | "POST";
    public: boolean;
    preview: boolean;
  }[];
}
export const contactFormDiscoverySchema: z.ZodType<
  ContactFormDiscovery,
  ContactFormDiscovery
> = z.strictObject({
  origin: z.string().url().max(2048),
  routes: z
    .array(
      z.strictObject({
        path: z.enum(["/contact", "/contact/thanks"]),
        method: z.enum(["GET", "POST"]),
        public: z.boolean(),
        preview: z.boolean(),
      }),
    )
    .max(3),
});
export const contactFormDiscoveryRequest: {
  readonly topic: string;
  readonly payload: z.ZodObject<Record<string, never>>;
  readonly response: typeof contactFormDiscoverySchema;
} = {
  topic: "contact:form-discovery",
  payload: z.strictObject({}),
  response: contactFormDiscoverySchema,
};

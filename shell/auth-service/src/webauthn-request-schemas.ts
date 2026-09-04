/**
 * Schemas for the WebAuthn credential responses posted to the verify endpoints.
 *
 * These bodies arrive unauthenticated from a browser and were asserted straight
 * into SimpleWebAuthn's response types. verifyRegistrationResponse and
 * verifyAuthenticationResponse do their own cryptographic checks, but they were
 * being handed a value that had not been shown to have the shape they destructure.
 *
 * Each schema is annotated with the SimpleWebAuthn interface it must produce,
 * so an upstream shape change fails the build here rather than at runtime.
 */
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "@brains/utils/zod";

/**
 * `clientExtensionResults` is an open-ended bag of client extension outputs.
 * It is checked to be an object and carried under its DOM type: a runtime
 * check, where the previous code asserted the whole envelope.
 */
const clientExtensionResultsSchema = z.custom<
  RegistrationResponseJSON["clientExtensionResults"]
>((value) => typeof value === "object" && value !== null);

const credentialEnvelope = {
  id: z.string(),
  rawId: z.string(),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  clientExtensionResults: clientExtensionResultsSchema,
  type: z.literal("public-key"),
};

/**
 * The transforms below rebuild the parsed value field by field, omitting absent
 * optionals rather than setting them to undefined. SimpleWebAuthn's interfaces
 * spell optionals as `?: T`, which under exactOptionalPropertyTypes forbids an
 * explicit undefined — and being upstream types, they cannot be widened here.
 * The explicit return annotation is what makes the compiler check the result.
 */
export const registrationResponseSchema: z.ZodType<
  RegistrationResponseJSON,
  unknown
> = z
  .object({
    ...credentialEnvelope,
    response: z.object({
      clientDataJSON: z.string(),
      attestationObject: z.string(),
      authenticatorData: z.string().optional(),
      transports: z
        .array(
          z.enum([
            "ble",
            "cable",
            "hybrid",
            "internal",
            "nfc",
            "smart-card",
            "usb",
          ]),
        )
        .optional(),
      publicKeyAlgorithm: z.number().optional(),
      publicKey: z.string().optional(),
    }),
  })
  .transform((value): RegistrationResponseJSON => {
    const { response } = value;
    return {
      id: value.id,
      rawId: value.rawId,
      type: value.type,
      clientExtensionResults: value.clientExtensionResults,
      ...(value.authenticatorAttachment !== undefined && {
        authenticatorAttachment: value.authenticatorAttachment,
      }),
      response: {
        clientDataJSON: response.clientDataJSON,
        attestationObject: response.attestationObject,
        ...(response.authenticatorData !== undefined && {
          authenticatorData: response.authenticatorData,
        }),
        ...(response.transports !== undefined && {
          transports: response.transports,
        }),
        ...(response.publicKeyAlgorithm !== undefined && {
          publicKeyAlgorithm: response.publicKeyAlgorithm,
        }),
        ...(response.publicKey !== undefined && {
          publicKey: response.publicKey,
        }),
      },
    };
  });

export const authenticationResponseSchema: z.ZodType<
  AuthenticationResponseJSON,
  unknown
> = z
  .object({
    ...credentialEnvelope,
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string(),
      userHandle: z.string().optional(),
    }),
  })
  .transform((value): AuthenticationResponseJSON => {
    const { response } = value;
    return {
      id: value.id,
      rawId: value.rawId,
      type: value.type,
      clientExtensionResults: value.clientExtensionResults,
      ...(value.authenticatorAttachment !== undefined && {
        authenticatorAttachment: value.authenticatorAttachment,
      }),
      response: {
        clientDataJSON: response.clientDataJSON,
        authenticatorData: response.authenticatorData,
        signature: response.signature,
        ...(response.userHandle !== undefined && {
          userHandle: response.userHandle,
        }),
      },
    };
  });

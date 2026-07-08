import {
  defaultMessageUploadFilename,
  isLikelyUtf8Text,
  isMessageUploadSizeAllowed,
  isTextUploadSizeAllowed,
  isUploadableBinaryFile,
  isUploadableTextFile,
  messageBinaryUploadAccept,
  messageTextUploadAccept,
  messageTextUploadMaxBytes,
  messageUploadAccept,
  messageUploadMaxBytes,
  normalizeMessageUploadMediaType,
  normalizeTextUploadMediaType,
  sanitizeUploadFilename,
  validateMessageUpload,
  validateTextUpload,
  type InvalidUpload,
  type MessageUploadPolicyErrorCode,
  type MessageUploadValidationResult,
  type ValidatedFileUpload,
  type ValidatedMessageUpload,
  type ValidatedTextUpload,
  type ValidateUploadInput,
  type TextUploadValidationResult,
} from "@brains/plugins/message-interface/upload-policy";

export const defaultWebChatUploadFilename: typeof defaultMessageUploadFilename =
  defaultMessageUploadFilename;
export const webChatTextUploadAccept: typeof messageTextUploadAccept =
  messageTextUploadAccept;
export const webChatBinaryUploadAccept: typeof messageBinaryUploadAccept =
  messageBinaryUploadAccept;
export const webChatUploadAccept: typeof messageUploadAccept =
  messageUploadAccept;
export const webChatTextUploadMaxBytes: typeof messageTextUploadMaxBytes =
  messageTextUploadMaxBytes;
export const webChatUploadMaxBytes: typeof messageUploadMaxBytes =
  messageUploadMaxBytes;

export {
  isLikelyUtf8Text,
  isMessageUploadSizeAllowed as isWebChatUploadSizeAllowed,
  isTextUploadSizeAllowed,
  isUploadableBinaryFile,
  isUploadableTextFile,
  normalizeMessageUploadMediaType as normalizeWebChatUploadMediaType,
  normalizeTextUploadMediaType,
  sanitizeUploadFilename,
  validateMessageUpload as validateWebChatUpload,
  validateTextUpload,
};

export type WebChatUploadPolicyErrorCode = MessageUploadPolicyErrorCode;
export type ValidatedWebChatUpload = ValidatedMessageUpload;
export type WebChatUploadValidationResult = MessageUploadValidationResult;
export type ValidateTextUploadInput = ValidateUploadInput;
export type {
  InvalidUpload as InvalidTextUpload,
  TextUploadValidationResult,
  ValidatedFileUpload,
  ValidatedTextUpload,
};

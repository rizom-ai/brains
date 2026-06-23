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

export const defaultWebChatUploadFilename = defaultMessageUploadFilename;
export const webChatTextUploadAccept = messageTextUploadAccept;
export const webChatBinaryUploadAccept = messageBinaryUploadAccept;
export const webChatUploadAccept = messageUploadAccept;
export const webChatTextUploadMaxBytes = messageTextUploadMaxBytes;
export const webChatUploadMaxBytes = messageUploadMaxBytes;

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

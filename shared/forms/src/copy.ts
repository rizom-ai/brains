import type { FormDenialReason } from "./admission";
import type { FormStepCopy } from "./steps-script";
import { FORM_FIELD_MESSAGES, type FormFieldMessages } from "./validate";

/** What the engine itself says to a visitor, beside a form's own copy. A
 * target's built-in form may say it in its own words. */
export interface FormCopy {
  /** Beside an optional field's label. */
  optional: string;
  /** The honeypot's label, read only by bots and screen readers it is hidden from. */
  trap: string;
  /** Why a submission or a form was refused. */
  denials: Record<FormDenialReason, string>;
  /** A request the form never serves. */
  denied: string;
  notFound: string;
  methodNotAllowed: string;
  mediaType: string;
  /** Shown while the form takes nothing. */
  paused: { title: string; body: string };
  /** A refusal before any form was issued. */
  refusedTitle: string;
  newForm: string;
  /** Where the owner's name stands when the site names none. */
  ownerFallback: string;
  fields: FormFieldMessages;
  /** The buttons and progress of a form shown one step at a time. */
  steps: FormStepCopy;
}

export const FORM_COPY: FormCopy = {
  optional: "(optional)",
  trap: "Leave this empty",
  denials: {
    "invalid-network": "Submissions can’t be sent from this connection.",
    "invalid-submission": "Check the marked fields before retrying.",
    "invalid-token":
      "This form is unavailable or expired. Copy your answers before opening a new form.",
    "submission-conflict":
      "This form already sent different answers. To send again, open a new form.",
    "rate-limited": "Too many requests. Please wait before retrying this form.",
    capacity:
      "There’s no room for new submissions right now. Please try this same form again later.",
    unavailable:
      "Your answers couldn’t be confirmed as saved. Send this same form again rather than opening a new one.",
  },
  denied: "Request denied.",
  notFound: "Page not found.",
  methodNotAllowed: "Method not allowed.",
  mediaType: "A URL-encoded form is required. Attachments are not accepted.",
  paused: {
    title: "This form is paused",
    body: "Submissions can’t be received right now. Please try this same form again later.",
  },
  refusedTitle: "Form unavailable",
  newForm: "Open a new form",
  ownerFallback: "the owner of this site",
  fields: FORM_FIELD_MESSAGES,
  steps: { next: "Next", back: "Back", step: "Step {n} of {total}" },
};

/** The engine's words in Traditional Chinese, drafted to be read and
 * corrected by native speakers. */
const FORM_COPY_ZH_TW: FormCopy = {
  optional: "（選填）",
  trap: "請留空",
  denials: {
    "invalid-network": "無法從這個連線送出。",
    "invalid-submission": "請檢查標示的欄位後再試一次。",
    "invalid-token": "這份表單已失效或過期。請先複製你的回答，再開啟新的表單。",
    "submission-conflict":
      "這份表單已送出不同的回答。若要再送一次，請開啟新的表單。",
    "rate-limited": "請求次數太多，請稍候再試。",
    capacity: "目前無法接收新的回答，請稍後用同一份表單再試一次。",
    unavailable:
      "無法確認你的回答已儲存。請再次送出同一份表單，不要開啟新的表單。",
  },
  denied: "請求遭拒。",
  notFound: "找不到頁面。",
  methodNotAllowed: "不允許的請求方式。",
  mediaType: "表單需以網址編碼送出，不接受附件。",
  paused: {
    title: "表單暫停中",
    body: "目前無法接收回答，請稍後用同一份表單再試一次。",
  },
  refusedTitle: "表單無法使用",
  newForm: "開啟新的表單",
  ownerFallback: "網站主人",
  fields: {
    required: (label) => `${label}為必填。`,
    tooLong: (label, max) => `${label}太長了：最多 ${max} 個字。`,
    email: () => "請輸入電子郵件地址。",
    choose: (label) => `請選擇「${label}」的答案。`,
    offList: (label) => `請從「${label}」的選項中選擇。`,
    tooMany: (label, max) => `「${label}」最多只能選 ${max} 個。`,
  },
  steps: { next: "下一步", back: "上一步", step: "第 {n} 步，共 {total} 步" },
};

const FORM_COPY_BY_LANGUAGE: ReadonlyMap<string, FormCopy> = new Map([
  ["en", FORM_COPY],
  ["zh-tw", FORM_COPY_ZH_TW],
]);

/** What the engine says in a page's language; English for a language it
 * does not speak. */
export function formCopyFor(language: string | undefined): FormCopy {
  return (
    FORM_COPY_BY_LANGUAGE.get((language ?? "en").toLowerCase()) ?? FORM_COPY
  );
}

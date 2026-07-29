export function resizePromptTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

/** Deferred a frame so focus lands after React has committed the new tree. */
export function focusPromptTextarea(
  textarea: HTMLTextAreaElement | null,
): void {
  requestAnimationFrame(() => textarea?.focus());
}

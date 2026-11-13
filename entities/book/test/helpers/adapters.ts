import { createMockShell, type MockShell } from "@brains/plugins/test";
import { installBook } from "../book-plugins";

/** The book types' adapters, as the installed package registers them. */
const shell: MockShell = createMockShell();
await installBook(shell);

export const bookAdapter: ReturnType<
  ReturnType<typeof shell.getEntityRegistry>["getAdapter"]
> = shell.getEntityRegistry().getAdapter("book");
export const bookSectionAdapter: ReturnType<
  ReturnType<typeof shell.getEntityRegistry>["getAdapter"]
> = shell.getEntityRegistry().getAdapter("book-section");

import { exerciseReadAdoption } from "./fixtures/turso-thread/read-adoption-exercise";
import { STAGE_BUDGET_BYTES } from "./fixtures/turso-thread/binary-protocol";

console.error(
  "[read-adoption] starting single 100 MiB component case (not the packed/authenticated matrix)",
);
const result = await exerciseReadAdoption({
  sizeBytes: STAGE_BUDGET_BYTES,
  scenario: "complete",
});
console.log(
  JSON.stringify({
    scope: "large-read-backing-adoption-component",
    ...result,
    authenticated: false,
    packaged: false,
    existingScannerReplaced: false,
  }),
);

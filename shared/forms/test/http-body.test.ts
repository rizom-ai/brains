import { describe, expect, it } from "bun:test";
import { FormHttpError, readForm } from "../src";

function post(body: string): Request {
  return new Request("https://brain.test/forms/quiz", {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}
const allowed = new Set(["token", "q1", "q2"]);

describe("a form's body", () => {
  it("gathers a field that may repeat, such as a set of checkboxes, as a list", async () => {
    expect(
      await readForm(
        post("token=t&q1=a&q2=x&q2=y"),
        1000,
        1000,
        allowed,
        new Set(["q2"]),
      ),
    ).toEqual({ token: "t", q1: "a", q2: ["x", "y"] });
    expect(
      await readForm(
        post("token=t&q2=x"),
        1000,
        1000,
        allowed,
        new Set(["q2"]),
      ),
    ).toEqual({ token: "t", q2: ["x"] });
  });

  it("refuses a repeated field that may not repeat, and a field the form does not have", async () => {
    for (const body of ["q1=a&q1=b", "q3=a"])
      expect(
        await readForm(post(body), 1000, 1000, allowed, new Set(["q2"])).catch(
          (error: unknown) => error,
        ),
      ).toEqual(new FormHttpError(400, "Invalid form fields."));
  });
});

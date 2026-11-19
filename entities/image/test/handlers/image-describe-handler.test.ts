import { afterEach, describe, expect, it } from "bun:test";
import { imageJobs, type ImageJobs } from "../image-job-harness";

let opened: ImageJobs | undefined;

async function jobs(
  options: Parameters<typeof imageJobs>[0] = {},
): Promise<ImageJobs> {
  opened = await imageJobs(options);
  return opened;
}

afterEach(async () => {
  await opened?.close();
  opened = undefined;
});

/** A generated image, whose alt is its title until it is described. */
async function harbor(images: ImageJobs): Promise<void> {
  await images.run("image:image-generate", {
    prompt: "A harbor",
    title: "Harbor",
  });
}

async function setAlt(
  images: ImageJobs,
  alt: string,
  altSource: "owner" | "generated",
): Promise<void> {
  const stored = await images.stored("image", "harbor");
  if (!stored) throw new Error("No harbor image");
  await images.service.updateEntity({
    entity: { ...stored, metadata: { ...stored.metadata, alt, altSource } },
  });
}

describe("describing an image for its alt text", () => {
  it("writes what the vision model sees, as generated alt text", async () => {
    const images = await jobs({ description: "Fishing boats moored at dawn." });
    await harbor(images);

    await images.run("image:image-describe", { imageId: "harbor" });

    expect((await images.stored("image", "harbor"))?.metadata).toMatchObject({
      title: "Harbor",
      alt: "Fishing boats moored at dawn.",
      altSource: "generated",
    });
    const [image, instruction] = images.describeImage.mock.calls[0] ?? [];
    expect(image?.mediaType).toBe("image/png");
    expect(image?.bytes.length).toBeGreaterThan(0);
    expect(instruction).toContain("125 characters");
  });

  it("keeps alt text the owner wrote, without asking the model", async () => {
    const images = await jobs({ description: "Fishing boats moored at dawn." });
    await harbor(images);
    await setAlt(images, "Our harbor, the morning we left", "owner");

    await images.run("image:image-describe", { imageId: "harbor" });

    expect((await images.stored("image", "harbor"))?.metadata).toMatchObject({
      alt: "Our harbor, the morning we left",
      altSource: "owner",
    });
    expect(images.describeImage).not.toHaveBeenCalled();
  });

  it("cuts a long description to 125 characters at a word", async () => {
    const images = await jobs({ description: `${"A boat ".repeat(30)}.` });
    await harbor(images);

    await images.run("image:image-describe", { imageId: "harbor" });

    const alt = (await images.stored("image", "harbor"))?.metadata["alt"];
    expect(typeof alt).toBe("string");
    expect(String(alt).length).toBeLessThanOrEqual(125);
    expect(String(alt).endsWith("boat")).toBe(true);
  });

  it("leaves the fallback when no model reads images", async () => {
    const images = await jobs();
    await harbor(images);

    await images.run("image:image-describe", { imageId: "harbor" });

    const metadata = (await images.stored("image", "harbor"))?.metadata;
    expect(metadata?.["alt"]).toBe("Harbor");
    expect(metadata?.["altSource"]).toBeUndefined();
  });
});

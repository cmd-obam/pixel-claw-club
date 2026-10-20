import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { detectImageKind } from "@/domain/image-bytes";
import { pixelateImage } from "@/server/images/pixelate";
import { isAppError } from "@/domain/errors";

describe("image pipeline", () => {
  it("rejects unsupported and invalid bytes", async () => {
    expect(detectImageKind(Buffer.from("not an image"))).toBeNull();
    await expect(pixelateImage(Buffer.from("hello"))).rejects.toMatchObject({ code: "PHOTO_FORMAT" });
    const broken = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11]);
    await expect(pixelateImage(broken)).rejects.toSatisfy((error: unknown) => isAppError(error));
  });

  it("keeps the original bytes and rejects an oversized dimension", async () => {
    const source = await sharp({
      create: { width: 12, height: 8, channels: 3, background: { r: 200, g: 40, b: 80 } },
    })
      .png()
      .toBuffer();
    const snapshot = Buffer.from(source);
    const result = await pixelateImage(source);
    expect(source.equals(snapshot)).toBe(true);
    expect(detectImageKind(result.png)).toBe("png");
    const meta = await sharp(result.png).metadata();
    expect(meta.width).toBe(384);
    const wide = await sharp({
      create: { width: 4097, height: 1, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await expect(pixelateImage(wide)).rejects.toMatchObject({ code: "PHOTO_DIMENSION" });
  });
});

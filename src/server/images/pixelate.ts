import sharp from "sharp";
import { AppError, isAppError } from "@/domain/errors";
import { detectImageKind, MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION } from "@/domain/image-bytes";

const SMALL = 48;

export async function pixelateImage(input: Buffer): Promise<{ png: Buffer; thumbnail: Buffer }> {
  const kind = detectImageKind(input);
  if (!kind) {
    throw new AppError("PHOTO_FORMAT", "JPEG, PNG, WebP 파일만 올릴 수 있습니다.");
  }
  if (input.byteLength > MAX_IMAGE_BYTES) {
    throw new AppError("PHOTO_SIZE", "파일은 5MB 이하만 올릴 수 있습니다.");
  }
  try {
    const base = sharp(input, {
      limitInputPixels: MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION,
      failOn: "error",
      animated: false,
    });
    const meta = await base.metadata();
    if (!meta.width || !meta.height) {
      throw new AppError("PHOTO_DECODE", "이미지를 읽지 못했습니다.");
    }
    if (meta.width > MAX_IMAGE_DIMENSION || meta.height > MAX_IMAGE_DIMENSION) {
      throw new AppError("PHOTO_DIMENSION", "이미지 한 변은 4096픽셀 이하여야 합니다.");
    }
    const { data, info } = await base
      .rotate()
      .resize(SMALL, SMALL, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const quant = Buffer.alloc(data.length);
    for (let index = 0; index < data.length; index += 1) {
      const rounded = Math.round((data[index] ?? 0) / 32) * 32;
      quant[index] = Math.min(255, rounded);
    }
    const png = await sharp(quant, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    })
      .resize(SMALL * 8, SMALL * 8, { kernel: "nearest" })
      .png()
      .toBuffer();
    const thumbnail = await sharp(png).resize(256, 256, { fit: "inside", kernel: "nearest" }).png().toBuffer();
    return { png, thumbnail };
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }
    throw new AppError("PHOTO_DECODE", "이미지를 읽지 못했습니다. 파일이 손상되었을 수 있습니다.");
  }
}

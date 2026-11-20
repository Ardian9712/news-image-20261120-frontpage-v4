import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8) {
    throw new Error("Output is not a JPEG image.");
  }

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) {
      throw new Error("Invalid JPEG marker in output.");
    }
    while (bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) break;

    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;

    if (offset + 2 > bytes.length) {
      throw new Error("Truncated JPEG segment in output.");
    }
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      throw new Error("Invalid JPEG segment length in output.");
    }

    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 8) {
        throw new Error("Truncated JPEG start-of-frame segment in output.");
      }
      return {
        width: bytes.readUInt16BE(offset + 5),
        height: bytes.readUInt16BE(offset + 3),
      };
    }
    offset += segmentLength;
  }

  throw new Error("JPEG output has no readable start-of-frame dimensions.");
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(scriptDirectory, "entry.png");
const outputDirectory = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? "/output");
const outputPath = join(outputDirectory, "entry.png");

await mkdir(outputDirectory, { recursive: true });
await copyFile(sourcePath, outputPath);

const output = await readFile(outputPath);
if (output.length > 1048576) {
  throw new Error(
    `Output exceeds the 1 MiB gate limit (1048576 bytes): ${output.length} bytes.`,
  );
}
const { width, height } = jpegDimensions(output);
if (width !== 1024 || height !== 1024) {
  throw new Error(`Expected a 1024x1024 JPEG output; found ${width}x${height}.`);
}

console.log(
  `Copied entry.png to ${outputPath}; validated JPEG dimensions: ${width}x${height}; output size: ${output.length} bytes (within the 1 MiB gate).`,
);

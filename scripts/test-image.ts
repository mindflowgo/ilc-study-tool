/**
 * Dependency-free test-image helpers: synthesize PNGs and probe dimensions
 * using the Bun.Image runtime builtin, so test scripts don't need pngjs or
 * jpeg-js in devDependencies.
 */

// Valid 8x6 solid-color PNG (verified IHDR/IDAT), used as the resize seed.
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAYAAAD+Bd/7AAAAEklEQVR42mO4ExDwHx9mGAoKAATQdxEAHNb0AAAAAElFTkSuQmCC';

interface BunImageInstance {
  metadata(): Promise<{ width: number; height: number; format?: string }>;
  resize(width: number): BunImageInstance;
  png(): BunImageInstance;
  jpeg(options?: { quality?: number }): BunImageInstance;
  bytes(): Promise<Uint8Array>;
}

type BunImageConstructor = new (input: Buffer | Uint8Array | ArrayBuffer | string) => BunImageInstance;

function getImage(): BunImageConstructor {
  const ctor = (globalThis as { Bun?: { Image?: BunImageConstructor } }).Bun?.Image;
  if (!ctor) {
    throw new Error('Bun.Image is unavailable (requires Bun >= 1.3.14)');
  }
  return ctor;
}

/** Produces a genuine PNG of the given width (8:6 aspect preserved). */
export async function makePng(width: number): Promise<Buffer> {
  const Image = getImage();
  const bytes = await new Image(Buffer.from(TINY_PNG_B64, 'base64')).resize(width).png().bytes();
  return Buffer.from(bytes);
}

/** Reads pixel dimensions from an encoded image (any supported format). */
export async function imageSize(bytes: Buffer | Uint8Array): Promise<{ width: number; height: number }> {
  const Image = getImage();
  return await new Image(bytes).metadata();
}

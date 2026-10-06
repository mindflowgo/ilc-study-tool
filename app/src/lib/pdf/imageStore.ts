import { CONTENT_WIDTH, MAX_IMAGE_HEIGHT } from './theme';
import type { EmbeddedImage, ImageEmbedder, ImageSettler, ImageSpec } from './types';

const PT_PER_PX = 0.75;
const CONCURRENCY = 6;

interface LoadJob {
  url: string;
  spec: ImageSpec;
  mode: 'block' | 'inline';
  placeholders: EmbeddedImage[];
}

/**
 * Browser image pipeline for the PDF compiler.
 *
 * - PNG/JPEG bytes are embedded directly (no re-encode, no canvas).
 * - GIF/SVG/WebP are decoded once to PNG via a small canvas, because the
 *   PDF format only accepts raster images — this is the only canvas used
 *   anywhere in the export path, and it is per-asset and tiny.
 * - Results are cached per URL; failures degrade to a text placeholder.
 */
export interface BrowserImageStore {
  embed(url: string, spec: ImageSpec, mode: 'block' | 'inline'): EmbeddedImage;
  settle(): Promise<void>;
  stats: { unique: number; resolved: number; failed: number };
}

export function createBrowserImageStore(): BrowserImageStore {
  const cache = new Map<string, EmbeddedImage>();
  const jobs = new Map<string, LoadJob>();
  const pending: Promise<void>[] = [];
  let active = 0;
  const queue: (() => void)[] = [];

  function pump(): void {
    while (active < CONCURRENCY && queue.length > 0) {
      const task = queue.shift()!;
      active++;
      task();
    }
  }

  function schedule<T>(work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve) => {
      queue.push(() => {
        work().then(resolve, resolve as (value: T) => void);
      });
      pump();
    });
  }

  async function loadBlobMeta(url: string): Promise<{ blob: Blob; width: number; height: number }> {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();

    try {
      const bitmap = await createImageBitmap(blob);
      const meta = { blob, width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return meta;
    } catch {
      // SVG and some GIFs cannot use createImageBitmap — fall back to <img>
      const meta = await loadViaImgElement(blob);
      return { blob, width: meta.width, height: meta.height };
    }
  }

  function loadViaImgElement(blob: Blob): Promise<{ width: number; height: number; element: HTMLImageElement }> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth || 24, height: img.naturalHeight || 24, element: img });
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('image decode failed'));
      };
      img.src = objectUrl;
    });
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(blob);
    });
  }

  async function rasterizeElement(
    img: HTMLImageElement,
    widthPx: number,
    heightPx: number
  ): Promise<string> {
    const scale = Math.min(2, Math.max(1, 96 * 2 / Math.max(1, Math.min(widthPx, heightPx) / PT_PER_PX || 96)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(widthPx * scale));
    canvas.height = Math.max(1, Math.round(heightPx * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }

  async function runJob(job: LoadJob): Promise<void> {
    try {
      const { blob, width, height } = await loadBlobMeta(job.url);
      const isDirect = blob.type === 'image/png' || blob.type === 'image/jpeg';

      let data: string;
      if (isDirect) {
        data = await blobToDataUrl(blob);
      } else {
        const { element } = await loadViaImgElement(blob);
        data = await rasterizeElement(element, width, height);
      }

      const size = computeSize(job.spec, width, height, job.mode);
      const resolved: EmbeddedImage = { image: data, width: size.width, height: size.height };
      cache.set(job.url, resolved);
      for (const ph of job.placeholders) {
        ph.image = resolved.image;
        ph.width = resolved.width;
        ph.height = resolved.height;
      }
    } catch (err) {
      console.warn(`[PDF Export] Image failed to load: ${job.url}`, err);
      for (const ph of job.placeholders) {
        ph.text = `[image unavailable${job.spec.alt ? `: ${job.spec.alt}` : ''}]`;
        ph.color = '#a8a29e';
        ph.fontSize = 8;
        ph.italics = true;
      }
    }
  }

  return {
    embed(url: string, spec: ImageSpec, mode: 'block' | 'inline'): EmbeddedImage {
      const placeholder: EmbeddedImage = {};
      const cached = cache.get(url);
      if (cached) {
        placeholder.image = cached.image;
        placeholder.width = cached.width;
        placeholder.height = cached.height;
        return placeholder;
      }

      const key = url;
      let job = jobs.get(key);
      if (!job) {
        job = { url, spec, mode, placeholders: [] };
        jobs.set(key, job);
        const p = schedule(() => runJob(job!)).then(() => {
          active--;
          pump();
        });
        pending.push(p);
      }
      job.placeholders.push(placeholder);
      return placeholder;
    },

    async settle(): Promise<void> {
      await Promise.all(pending.splice(0));
    },

    stats: {
      get unique() {
        return jobs.size;
      },
      get resolved() {
        return cache.size;
      },
      get failed() {
        return jobs.size - cache.size;
      }
    }
  };
}

function computeSize(
  spec: ImageSpec,
  naturalWidthPx: number,
  naturalHeightPx: number,
  mode: 'block' | 'inline'
): { width: number; height: number } {
  const naturalW = naturalWidthPx * PT_PER_PX;
  const naturalH = naturalHeightPx * PT_PER_PX;

  if (mode === 'inline') {
    // Icons: cap height, preserve ratio
    const h = Math.min(naturalH, 24);
    return { width: (h / naturalH) * naturalW || h, height: h };
  }

  let targetW: number | null = spec.widthPt;
  if (spec.widthPct !== null) targetW = spec.widthPct * CONTENT_WIDTH;

  if (targetW && spec.heightPt) {
    return fitWithin(targetW, spec.heightPt, naturalW, naturalH);
  }
  if (targetW) {
    const h = (targetW / naturalW) * naturalH;
    if (h > MAX_IMAGE_HEIGHT) {
      targetW = (MAX_IMAGE_HEIGHT / h) * targetW;
    }
    return { width: targetW, height: (targetW / naturalW) * naturalH };
  }
  if (spec.heightPt) {
    return { width: (spec.heightPt / naturalH) * naturalW, height: spec.heightPt };
  }

  // Default: viewer-like fit — full content width, capped at 480px (360pt) tall
  return fitWithin(CONTENT_WIDTH, 360, naturalW, naturalH);
}

function fitWithin(
  maxW: number,
  maxH: number,
  naturalW: number,
  naturalH: number
): { width: number; height: number } {
  const scale = Math.min(maxW / naturalW, maxH / naturalH, 1);
  return { width: naturalW * scale, height: naturalH * scale };
}

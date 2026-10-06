import { registerDejaVuFonts } from './fontLoader';

/**
 * Lazily loads the pdfmake browser bundle (with fonts) the first time a
 * PDF is exported, then caches the configured instance. Keeps pdfmake's
 * ~1.5MB out of the app's startup path entirely.
 */

type PdfMakeClient = Record<string, unknown> & {
  createPdf: (doc: unknown) => { getBlob: () => Promise<Blob>; download: (filename: string) => void };
};

let clientPromise: Promise<PdfMakeClient> | null = null;

export function getPdfMake(): Promise<PdfMakeClient> {
  clientPromise ??= (async () => {
    const mod = (await import('pdfmake/build/pdfmake')) as unknown as {
      default?: PdfMakeClient;
    } & PdfMakeClient;
    const pdfMake: PdfMakeClient = mod.default ?? mod;
    await registerDejaVuFonts(pdfMake as Parameters<typeof registerDejaVuFonts>[0]);
    return pdfMake;
  })();
  return clientPromise;
}

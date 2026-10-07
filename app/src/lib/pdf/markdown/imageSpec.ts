import { CONTENT_WIDTH } from '../theme';
import type { ImageSpec } from '../types';
import {
  parsePdfImageSpec,
  isIconImage,
  PT_PER_PX,
  PT_PER_REM
} from '$lib/markdown/imageSpec';

export { isIconImage, PT_PER_PX, PT_PER_REM };

/**
 * Parses the app's custom image sizing syntax `![alt|spec](url)`,
 * producing PDF points for pdfmake using the unified parser.
 */
export function parseImageSpec(rawAlt: string): ImageSpec {
  return parsePdfImageSpec(rawAlt, { maxContentWidthPt: CONTENT_WIDTH });
}

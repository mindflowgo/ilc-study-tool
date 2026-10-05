import fs from 'node:fs';
import path from 'node:path';

const APP_DIR = path.resolve(process.cwd());
const STATIC_DIR = path.join(APP_DIR, 'static');
const FONTS_DIR = path.join(STATIC_DIR, 'fonts');
const KATEX_TARGET_DIR = path.join(STATIC_DIR, 'vendor', 'katex');
const KATEX_SOURCE_DIR = path.join(APP_DIR, 'node_modules', 'katex', 'dist');

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.statusText}`);
  }
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
}

async function run() {
  console.log('🚀 Preparing local static assets for offline use...');

  // 1. Setup directories
  fs.mkdirSync(FONTS_DIR, { recursive: true });
  fs.mkdirSync(path.join(KATEX_TARGET_DIR, 'fonts'), { recursive: true });

  // 2. Copy KaTeX from node_modules
  if (fs.existsSync(KATEX_SOURCE_DIR)) {
    console.log('📦 Copying KaTeX css and fonts from node_modules/katex/dist...');
    fs.copyFileSync(
      path.join(KATEX_SOURCE_DIR, 'katex.min.css'),
      path.join(KATEX_TARGET_DIR, 'katex.min.css')
    );

    const katexFontsDir = path.join(KATEX_SOURCE_DIR, 'fonts');
    if (fs.existsSync(katexFontsDir)) {
      const files = fs.readdirSync(katexFontsDir);
      for (const file of files) {
        fs.copyFileSync(
          path.join(katexFontsDir, file),
          path.join(KATEX_TARGET_DIR, 'fonts', file)
        );
      }
      console.log(`✅ Copied KaTeX CSS and ${files.length} font files to static/vendor/katex/`);
    }
  } else {
    console.warn('⚠️ node_modules/katex/dist not found, please ensure katex is installed.');
  }

  // 3. Download Google Fonts CSS
  const googleFontsUrl =
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';
  console.log(`🌐 Fetching Google Fonts CSS from ${googleFontsUrl}...`);

  const userAgent =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const res = await fetch(googleFontsUrl, {
    headers: { 'User-Agent': userAgent }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Google Fonts CSS: ${res.statusText}`);
  }

  let cssText = await res.text();

  // Find all font URLs
  const fontUrlRegex = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g;
  const matches = Array.from(cssText.matchAll(fontUrlRegex));
  console.log(`📥 Found ${matches.length} webfont files to download...`);

  let count = 0;
  for (const match of matches) {
    const fontUrl = match[1];
    const urlObj = new URL(fontUrl);
    const originalFileName = path.basename(urlObj.pathname);
    const localFileName = originalFileName.endsWith('.woff2')
      ? originalFileName
      : `${originalFileName}.woff2`;

    const localFilePath = path.join(FONTS_DIR, localFileName);

    if (!fs.existsSync(localFilePath)) {
      await downloadFile(fontUrl, localFilePath);
      count++;
    }

    // Replace in CSS with local path relative to root
    cssText = cssText.replace(fontUrl, `/fonts/${localFileName}`);
  }

  const fontsCssPath = path.join(FONTS_DIR, 'fonts.css');
  fs.writeFileSync(fontsCssPath, cssText, 'utf8');

  console.log(`✅ Saved local fonts CSS to ${fontsCssPath} with ${count} downloaded .woff2 files.`);
  console.log('🎉 Offline static assets preparation complete!');
}

run().catch((e) => {
  console.error('❌ Error downloading static assets:', e);
  process.exit(1);
});

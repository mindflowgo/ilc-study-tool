import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT_DIR = path.resolve(__dirname, '..');
const TAURI_DIR = path.join(ROOT_DIR, 'tauri');
const TAURI_CONF_PATH = path.join(TAURI_DIR, 'tauri.conf.json');

// 1. Read product information from tauri.conf.json
if (!fs.existsSync(TAURI_CONF_PATH)) {
  console.error(`[Portable Build] Could not find tauri.conf.json at: ${TAURI_CONF_PATH}`);
  process.exit(1);
}

const tauriConf = JSON.parse(fs.readFileSync(TAURI_CONF_PATH, 'utf-8'));
const productName: string = tauriConf.productName || 'Course Study Tool';
const version: string = tauriConf.version || '0.1.0';

console.log(`[Portable Build] Preparing portable build for ${productName} v${version}...`);

// 2. Locate makensis.exe
function findMakeNsis(): string | null {
  // Check PATH first
  const whichCmd = process.platform === 'win32' ? 'where.exe' : 'which';
  const checkPath = spawnSync(whichCmd, ['makensis'], { encoding: 'utf-8' });
  if (checkPath.status === 0 && checkPath.stdout) {
    const found = checkPath.stdout.trim().split(/\r?\n/)[0];
    if (found && fs.existsSync(found)) return found;
  }

  // Check Tauri's downloaded NSIS on Windows
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const tauriNsis = path.join(localAppData, 'tauri', 'NSIS', 'makensis.exe');
    if (fs.existsSync(tauriNsis)) return tauriNsis;
  }

  // Check standard installation paths
  const standardPaths = [
    'C:\\Program Files (x86)\\NSIS\\makensis.exe',
    'C:\\Program Files\\NSIS\\makensis.exe'
  ];
  for (const p of standardPaths) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

const makensisPath = findMakeNsis();
if (!makensisPath) {
  console.error('[Portable Build] Error: makensis (NSIS) could not be located.');
  console.error('Make sure NSIS is installed, or that Tauri has downloaded NSIS.');
  process.exit(1);
}

console.log(`[Portable Build] Using NSIS compiler: ${makensisPath}`);

// 3. Ensure backend sidecar is compiled (tauri/server.exe on Windows, tauri/server on unix)
const serverBinaryName = process.platform === 'win32' ? 'server.exe' : 'server';
const serverBinaryPath = path.join(TAURI_DIR, serverBinaryName);

if (!fs.existsSync(serverBinaryPath)) {
  console.log(`[Portable Build] Sidecar binary not found at ${serverBinaryPath}. Compiling sidecar...`);
  const compileRes = spawnSync(
    'bun',
    ['build', '--compile', '--outfile', path.join(TAURI_DIR, 'server'), 'server/index.ts'],
    { cwd: ROOT_DIR, stdio: 'inherit' }
  );
  if (compileRes.status !== 0) {
    console.error('[Portable Build] Failed to compile server sidecar.');
    process.exit(1);
  }
}

// 4. Build Tauri release executable (--no-bundle)
console.log('[Portable Build] Building Tauri binary (release mode, no-bundle)...');
const tauriBuildRes = spawnSync(
  'bunx',
  ['tauri', 'build', '--no-bundle'],
  { cwd: TAURI_DIR, stdio: 'inherit', shell: true }
);

if (tauriBuildRes.status !== 0) {
  console.error('[Portable Build] Tauri build failed.');
  process.exit(1);
}

// 5. Verify built binaries
const releaseDir = path.join(TAURI_DIR, 'target', 'release');
const mainExeName = 'ilc-study-tool.exe';
const mainExePath = path.join(releaseDir, mainExeName);

if (!fs.existsSync(mainExePath)) {
  console.error(`[Portable Build] Main executable not found at: ${mainExePath}`);
  process.exit(1);
}

// 6. Create standalone portable folder distribution (unpacked)
const portableBundleDir = path.join(releaseDir, 'bundle', 'portable');
fs.mkdirSync(portableBundleDir, { recursive: true });

const unpackedAppDir = path.join(portableBundleDir, productName);
fs.mkdirSync(unpackedAppDir, { recursive: true });

fs.copyFileSync(mainExePath, path.join(unpackedAppDir, `${productName}.exe`));
fs.copyFileSync(serverBinaryPath, path.join(unpackedAppDir, serverBinaryName));
console.log(`[Portable Build] Created unpacked portable folder at: ${unpackedAppDir}`);

// 7. Generate NSIS script for the single-file self-contained portable executable
const nsisOutputDir = path.join(releaseDir, 'bundle', 'nsis');
fs.mkdirSync(nsisOutputDir, { recursive: true });

const portableExeName = `${productName}_${version}_x64-portable.exe`;
const portableExePath = path.join(nsisOutputDir, portableExeName);
const iconPath = path.join(TAURI_DIR, 'icons', 'icon.ico');
const tempNsiPath = path.join(TAURI_DIR, `temp_portable_${Date.now()}.nsi`);

const nsiScript = `Unicode true
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
ShowInstDetails nevershow
SetCompressor /SOLID lzma

!include "FileFunc.nsh"
!include "LogicLib.nsh"
!insertmacro GetParameters

Name "${productName}"
OutFile "${portableExePath.replace(/\\/g, '\\\\')}"
${fs.existsSync(iconPath) ? `Icon "${iconPath.replace(/\\/g, '\\\\')}"` : ''}

VIProductVersion "${version}.0"
VIAddVersionKey "ProductName" "${productName}"
VIAddVersionKey "ProductVersion" "${version}"
VIAddVersionKey "FileVersion" "${version}.0"
VIAddVersionKey "FileDescription" "${productName} (Portable)"
VIAddVersionKey "LegalCopyright" "${productName}"
VIAddVersionKey "OriginalFilename" "${portableExeName}"

Section
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "${mainExePath.replace(/\\/g, '\\\\')}"
  File "${serverBinaryPath.replace(/\\/g, '\\\\')}"

  \${GetParameters} $R0

  ; Preserve launcher directory as working directory so local data directories and relative paths work
  SetOutPath "$EXEDIR"
  \${If} $R0 == ""
    ExecWait '"$PLUGINSDIR\\\\${mainExeName}"'
  \${Else}
    ExecWait '"$PLUGINSDIR\\\\${mainExeName}" $R0'
  \${EndIf}
SectionEnd
`;

fs.writeFileSync(tempNsiPath, nsiScript, 'utf-8');

try {
  console.log(`[Portable Build] Compiling single-file portable executable with NSIS...`);
  const nsisRun = spawnSync(makensisPath, [tempNsiPath], { stdio: 'inherit' });
  if (nsisRun.status !== 0) {
    console.error('[Portable Build] makensis compilation failed.');
    process.exit(1);
  }

  // Also create a friendly-named copy in the nsis bundle and portable directories
  const friendlyCopyPath = path.join(nsisOutputDir, `${productName} Portable.exe`);
  fs.copyFileSync(portableExePath, friendlyCopyPath);
  fs.copyFileSync(portableExePath, path.join(portableBundleDir, `${productName} Portable.exe`));

  const stats = fs.statSync(portableExePath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

  console.log('\n========================================');
  console.log('✓ Portable Build Complete!');
  console.log(`- Portable Exe:    ${portableExePath} (${sizeMb} MB)`);
  console.log(`- Convenient Copy: ${friendlyCopyPath}`);
  console.log(`- Unpacked Folder: ${unpackedAppDir}`);
  console.log('========================================\n');
} finally {
  if (fs.existsSync(tempNsiPath)) {
    fs.unlinkSync(tempNsiPath);
  }
}

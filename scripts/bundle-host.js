// bundle-host.js - Bundles src/host/*.js and installed wasi-host into standalone dist/raylib-host.js
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const hostDir = path.join(__dirname, '..', 'src', 'host');
const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Resolve installed wasi-host package source files for standalone release bundle
const wasiHostSrcDir = path.dirname(fileURLToPath(import.meta.resolve('wasi-host')));
const wasiConstantsSrc = fs.readFileSync(path.join(wasiHostSrcDir, 'constants.js'), 'utf-8');
const wasiVfsAdapterSrc = fs.readFileSync(path.join(wasiHostSrcDir, 'vfs-adapter.js'), 'utf-8');
const wasiHostCoreSrc = fs.readFileSync(path.join(wasiHostSrcDir, 'wasi-host.js'), 'utf-8');

const glContextSrc = fs.readFileSync(path.join(hostDir, 'gl-context.js'), 'utf-8');
const inputSrc = fs.readFileSync(path.join(hostDir, 'input.js'), 'utf-8');
const audioSrc = fs.readFileSync(path.join(hostDir, 'audio-context.js'), 'utf-8');
const indexSrc = fs.readFileSync(path.join(hostDir, 'index.js'), 'utf-8');

// Strip local import/export statements when assembling single standalone ES module
function stripImportsAndExports(src) {
  return src
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/^export\s+\*\s+from\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/^export\s+(const|let|var|function|class)/gm, '$1')
    .replace(/^export\s+\{[\s\S]*?\};?\s*$/gm, '')
    .replace(/^export\s+default\s+.*?;?\s*$/gm, '');
}

// Avoid duplicate top-level constant names across concatenated modules
function deduplicateTopLevel(src, renames = []) {
  let out = src;
  for (const [from, to] of renames) {
    out = out.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }
  return out;
}

const cleanWasiVfs = deduplicateTopLevel(stripImportsAndExports(wasiVfsAdapterSrc), [
  ['textEncoder', 'wasiAdapterTextEncoder'],
]);
const cleanWasiCore = deduplicateTopLevel(stripImportsAndExports(wasiHostCoreSrc), [
  ['textEncoder', 'wasiCoreTextEncoder'],
  ['textDecoder', 'wasiCoreTextDecoder'],
  ['HAS_SAB', 'WASI_HAS_SAB'],
]);
const cleanIndex = deduplicateTopLevel(stripImportsAndExports(indexSrc), [
  ['HAS_SAB', 'RAYLIB_HAS_SAB'],
]);

const bundleContent = `/**
 * raylib-wasi Standalone Host Runtime Bridge
 * Vanilla ES module for WebGL, input sync, Web Audio & WASI execution (powered by wasi-host)
 * https://github.com/breeze833/raylib-wasi
 */

${stripImportsAndExports(wasiConstantsSrc)}

${cleanWasiVfs}

${cleanWasiCore}

${stripImportsAndExports(glContextSrc)}

${stripImportsAndExports(inputSrc)}

${stripImportsAndExports(audioSrc)}

${cleanIndex}

export { createGLImports, createMockGL, InputCoordinator, createWasiImports, createAudioImports, createAudioReceiver, createRaylibHost, RaylibReferenceHost, WasiHost, ProcExit, normalizePath };
export default createRaylibHost;
`;

fs.writeFileSync(path.join(distDir, 'raylib-host.js'), bundleContent, 'utf-8');
console.log('Successfully bundled dist/raylib-host.js (' + Buffer.byteLength(bundleContent) + ' bytes)');

// Copy and generate headers if submodule is present
const vendorIncDir = path.join(__dirname, '..', 'vendor', 'raylib', 'src');
const vendorRayguiPath = path.join(__dirname, '..', 'vendor', 'raylib', 'examples', 'shapes', 'raygui.h');
const distIncDir = path.join(distDir, 'include');

if (fs.existsSync(path.join(vendorIncDir, 'raylib.h'))) {
  if (!fs.existsSync(distIncDir)) {
    fs.mkdirSync(distIncDir, { recursive: true });
  }
  const raylibH = fs.readFileSync(path.join(vendorIncDir, 'raylib.h'), 'utf-8');
  const raymathH = fs.readFileSync(path.join(vendorIncDir, 'raymath.h'), 'utf-8');
  const rlglH = fs.readFileSync(path.join(vendorIncDir, 'rlgl.h'), 'utf-8');
  const rayguiH = fs.existsSync(vendorRayguiPath) ? fs.readFileSync(vendorRayguiPath, 'utf-8') : '';

  fs.writeFileSync(path.join(distIncDir, 'raylib.h'), raylibH, 'utf-8');
  fs.writeFileSync(path.join(distIncDir, 'raymath.h'), raymathH, 'utf-8');
  fs.writeFileSync(path.join(distIncDir, 'rlgl.h'), rlglH, 'utf-8');
  if (rayguiH) {
    fs.writeFileSync(path.join(distIncDir, 'raygui.h'), rayguiH, 'utf-8');
  }

  const headersJs = `// raylib-wasi: C headers exported as string constants for browser virtual filesystems\n// Generated automatically from vendor/raylib/src by scripts/bundle-host.js\n\nexport const RAYLIB_H = ${JSON.stringify(raylibH)};\n\nexport const RAYMATH_H = ${JSON.stringify(raymathH)};\n\nexport const RLGL_H = ${JSON.stringify(rlglH)};\n\nexport const RAYGUI_H = ${JSON.stringify(rayguiH)};\n`;
  fs.writeFileSync(path.join(distDir, 'headers.js'), headersJs, 'utf-8');

  const headersDts = `export declare const RAYLIB_H: string;\nexport declare const RAYMATH_H: string;\nexport declare const RLGL_H: string;\nexport declare const RAYGUI_H: string;\n`;
  fs.writeFileSync(path.join(distDir, 'headers.d.ts'), headersDts, 'utf-8');
  console.log('Successfully generated dist/headers.js and copied dist/include headers (raylib.h, raymath.h, rlgl.h, raygui.h)');
}

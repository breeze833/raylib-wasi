// bundle-host.js - Bundles src/host/*.js into a single standalone ES module dist/raylib-host.js without npm dependencies
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const hostDir = path.join(__dirname, '..', 'src', 'host');
const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const glContextSrc = fs.readFileSync(path.join(hostDir, 'gl-context.js'), 'utf-8');
const inputSrc = fs.readFileSync(path.join(hostDir, 'input.js'), 'utf-8');
const wasiSrc = fs.readFileSync(path.join(hostDir, 'wasi.js'), 'utf-8');
const indexSrc = fs.readFileSync(path.join(hostDir, 'index.js'), 'utf-8');

// Strip export declarations from inner modules and assemble single standalone ES module
function stripImportsAndExports(src) {
  return src
    .replace(/^import\s+.*?;\s*$/gm, '')
    .replace(/^export\s+(const|let|var|function|class)/gm, '$1')
    .replace(/^export\s+\{.*?\};?\s*$/gm, '')
    .replace(/^export\s+default\s+.*?;?\s*$/gm, '');
}

const bundleContent = `/**
 * raylib-wasi Standalone Host Runtime Bridge
 * Zero-dependency vanilla ES module for WebGL, input sync & WASI execution
 * https://github.com/breeze833/raylib-wasi
 */

${stripImportsAndExports(glContextSrc)}

${stripImportsAndExports(inputSrc)}

${stripImportsAndExports(wasiSrc)}

${stripImportsAndExports(indexSrc)}

export { createGLImports, InputCoordinator, createWasiImports, createRaylibHost };
export default createRaylibHost;
`;

fs.writeFileSync(path.join(distDir, 'raylib-host.js'), bundleContent, 'utf-8');
console.log('Successfully bundled dist/raylib-host.js (' + Buffer.byteLength(bundleContent) + ' bytes)');

// Copy and generate headers if submodule is present
const vendorIncDir = path.join(__dirname, '..', 'vendor', 'raylib', 'src');
const distIncDir = path.join(distDir, 'include');

if (fs.existsSync(path.join(vendorIncDir, 'raylib.h'))) {
  if (!fs.existsSync(distIncDir)) {
    fs.mkdirSync(distIncDir, { recursive: true });
  }
  const raylibH = fs.readFileSync(path.join(vendorIncDir, 'raylib.h'), 'utf-8');
  const raymathH = fs.readFileSync(path.join(vendorIncDir, 'raymath.h'), 'utf-8');
  const rlglH = fs.readFileSync(path.join(vendorIncDir, 'rlgl.h'), 'utf-8');

  fs.writeFileSync(path.join(distIncDir, 'raylib.h'), raylibH, 'utf-8');
  fs.writeFileSync(path.join(distIncDir, 'raymath.h'), raymathH, 'utf-8');
  fs.writeFileSync(path.join(distIncDir, 'rlgl.h'), rlglH, 'utf-8');

  const headersJs = `// raylib-wasi: C headers exported as string constants for browser virtual filesystems\n// Generated automatically from vendor/raylib/src by scripts/bundle-host.js\n\nexport const RAYLIB_H = ${JSON.stringify(raylibH)};\n\nexport const RAYMATH_H = ${JSON.stringify(raymathH)};\n\nexport const RLGL_H = ${JSON.stringify(rlglH)};\n`;
  fs.writeFileSync(path.join(distDir, 'headers.js'), headersJs, 'utf-8');

  const headersDts = `export declare const RAYLIB_H: string;\nexport declare const RAYMATH_H: string;\nexport declare const RLGL_H: string;\n`;
  fs.writeFileSync(path.join(distDir, 'headers.d.ts'), headersDts, 'utf-8');
  console.log('Successfully generated dist/headers.js and copied dist/include headers');
}

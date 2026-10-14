// bundle-host.js - Bundles src/host/*.js into a single standalone ES module dist/raylib-host.js without npm dependencies
const fs = require('fs');
const path = require('path');

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

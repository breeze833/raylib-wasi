// postinstall.js - Automatically downloads precompiled raylib-wasi binaries if not present
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const libFile = path.join(distDir, 'lib', 'libraylib.a');
const headerFile = path.join(distDir, 'include', 'raylib.h');

// 1. If precompiled binaries already exist (e.g. from source build or npm tarball), exit immediately
if (fs.existsSync(libFile) && fs.existsSync(headerFile)) {
  process.exit(0);
}

const releaseUrl = process.env.RAYLIB_WASI_DOWNLOAD_URL ||
  'https://github.com/breeze833/raylib-wasi/releases/download/latest/raylib-wasi.tar.gz';

console.log('[raylib-wasi] Precompiled binaries not found. Downloading from GitHub Releases...');
console.log(`[raylib-wasi] Fetching: ${releaseUrl}`);

function extractTarGz(tarGzBuffer, targetDir) {
  const tarBuffer = zlib.gunzipSync(tarGzBuffer);
  let offset = 0;
  while (offset < tarBuffer.length - 512) {
    const isZeroBlock = tarBuffer.subarray(offset, offset + 512).every(b => b === 0);
    if (isZeroBlock) break;

    let name = tarBuffer.toString('utf8', offset, offset + 100).replace(/\0.*$/, '').trim();
    if (!name) break;

    const prefix = tarBuffer.toString('utf8', offset + 345, offset + 500).replace(/\0.*$/, '').trim();
    if (prefix) name = path.join(prefix, name);

    const sizeStr = tarBuffer.toString('utf8', offset + 124, offset + 136).replace(/\0.*$/, '').trim();
    const size = parseInt(sizeStr, 8) || 0;
    const type = String.fromCharCode(tarBuffer[offset + 156]);

    offset += 512;
    const outPath = path.join(targetDir, name);

    if (type === '5' || name.endsWith('/')) {
      fs.mkdirSync(outPath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, tarBuffer.subarray(offset, offset + size));
    }

    offset += Math.ceil(size / 512) * 512;
  }
}

async function downloadAndExtract() {
  try {
    fs.mkdirSync(distDir, { recursive: true });
    const response = await fetch(releaseUrl, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    extractTarGz(buffer, distDir);

    if (fs.existsSync(libFile) && fs.existsSync(headerFile)) {
      console.log('[raylib-wasi] Successfully installed precompiled libraylib.a and headers to dist/');
    } else {
      console.warn('[raylib-wasi] Warning: Archive extracted but libraylib.a or headers were missing.');
    }
  } catch (err) {
    console.warn(`[raylib-wasi] Failed to download prebuilt binary: ${err.message}`);
    console.warn("[raylib-wasi] You can build from source using 'make all' or download raylib-wasi.tar.gz manually.");
  }
}

downloadAndExtract();

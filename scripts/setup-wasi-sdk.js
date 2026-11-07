#!/usr/bin/env node
// scripts/setup-wasi-sdk.js - Downloads and installs wasi-sdk locally into .wasi-sdk
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const targetDir = path.join(rootDir, '.wasi-sdk');
const clangPath = path.join(targetDir, 'bin', process.platform === 'win32' ? 'clang.exe' : 'clang');

const WASI_VERSION = process.env.WASI_SDK_MAJOR || '29';
const WASI_VERSION_FULL = process.env.WASI_SDK_VERSION || `${WASI_VERSION}.0`;

// 1. Check if wasi-sdk is already installed
if (!process.argv.includes('--force') && fs.existsSync(clangPath)) {
  console.log(`[wasi-sdk] Found existing wasi-sdk at: ${targetDir}`);
  process.exit(0);
}

// 2. Map OS and architecture to wasi-sdk release naming
function getPlatformInfo() {
  const osMap = {
    linux: 'linux',
    darwin: 'macos',
    win32: 'windows',
  };
  const archMap = {
    x64: 'x86_64',
    arm64: 'arm64',
  };

  const os = osMap[process.platform];
  const arch = archMap[process.arch];

  if (!os || !arch) {
    throw new Error(`Unsupported platform or architecture: ${process.platform} (${process.arch})`);
  }

  return { os, arch };
}

async function main() {
  const { os, arch } = getPlatformInfo();
  const tarName = `wasi-sdk-${WASI_VERSION_FULL}-${arch}-${os}.tar.gz`;
  const downloadUrl = `https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_VERSION}/${tarName}`;
  const tmpArchive = path.join(rootDir, `.wasi-sdk-${process.pid}.tar.gz`);

  console.log(`[wasi-sdk] Preparing wasi-sdk ${WASI_VERSION_FULL} for ${os}-${arch}...`);
  console.log(`[wasi-sdk] Downloading from: ${downloadUrl}`);

  try {
    const response = await fetch(downloadUrl, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`Failed to download ${downloadUrl} (HTTP ${response.status} ${response.statusText})`);
    }

    const totalBytes = Number(response.headers.get('content-length')) || 0;
    let downloadedBytes = 0;
    let lastLoggedPercent = -1;

    // Monitor download progress
    const progressStream = new ReadableStream({
      async start(controller) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            break;
          }
          downloadedBytes += value.length;
          if (totalBytes > 0) {
            const percent = Math.floor((downloadedBytes / totalBytes) * 100);
            if (percent !== lastLoggedPercent && percent % 20 === 0) {
              console.log(`[wasi-sdk] Download progress: ${percent}% (${Math.round(downloadedBytes / (1024 * 1024))}MB / ${Math.round(totalBytes / (1024 * 1024))}MB)`);
              lastLoggedPercent = percent;
            }
          }
          controller.enqueue(value);
        }
      }
    });

    const fileStream = fs.createWriteStream(tmpArchive);
    await pipeline(Readable.fromWeb(progressStream), fileStream);

    console.log(`[wasi-sdk] Download complete. Extracting to ${targetDir}...`);
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });

    // Extract tarball stripping top-level directory
    execFileSync('tar', ['-xzf', tmpArchive, '-C', targetDir, '--strip-components=1'], {
      stdio: 'inherit',
    });

    if (!fs.existsSync(clangPath)) {
      throw new Error(`Extraction finished but ${clangPath} was not found!`);
    }

    console.log(`[wasi-sdk] Successfully installed wasi-sdk ${WASI_VERSION_FULL} to ${targetDir}`);
  } finally {
    if (fs.existsSync(tmpArchive)) {
      fs.rmSync(tmpArchive, { force: true });
    }
  }
}

main().catch((err) => {
  console.error(`[wasi-sdk] Installation failed: ${err.message}`);
  process.exit(1);
});

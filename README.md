# raylib-wasi

[![Build and Test](https://github.com/breeze833/raylib-wasi/actions/workflows/build.yml/badge.svg)](https://github.com/breeze833/raylib-wasi/actions/workflows/build.yml)
[![Raylib](https://img.shields.io/badge/raylib-5.5-orange.svg)](https://github.com/raysan5/raylib)
[![WASI](https://img.shields.io/badge/WASI-Snapshot%20Preview%201-blue.svg)](https://wasi.dev)
[![Zero Emscripten](https://img.shields.io/badge/Emscripten-Zero%20Dependency-brightgreen.svg)]()

**raylib-wasi** is a standalone, open-source build distribution and host runtime bridge for **Raylib 5.5** targeting pure WebAssembly with WASI (`wasm32-wasi` / `wasm32-wasip1`), completely free of Emscripten.

---

## 🌟 Key Features

- **Zero Emscripten Dependency**: Compiles with standard LLVM/Clang and `wasi-libc` / `wasi-sdk` targeting `wasm32-wasi`.
- **Zero-Diff Upstream Maintenance**: Upstream `raysan5/raylib` is tracked as an untouched Git submodule at release tag `5.5`. Not a single line of Raylib's source is patched.
- **Raylib 5.5 `PLATFORM_CUSTOM` Architecture**: Implemented via a clean custom platform adapter (`src/rcore_wasi.c`) and WebGL / GLES 2.0 bindings (`src/gl_wasi.c`, `src/gl_wasi.h`, `src/GLES2/`).
- **Synchronous Web Worker Execution (`wasm-c-ide` integration)**: Standard Raylib game loops (`while (!WindowShouldClose())`) run directly inside Web Workers without freezing the browser UI, using `SharedArrayBuffer` and `Atomics.wait()` for frame pacing (`SetTargetFPS(60)`) and synchronous keyboard/mouse input handling.
- **Zero-Dependency Host Bridge**: Standalone vanilla ES module runtime (`dist/raylib-host.js`, ~39 KB) supplying `"gl"`, `"raylib"`, and `"wasi_snapshot_preview1"` namespaces to `WebAssembly.instantiate`.

---

## 🏗️ Architecture

```
+-------------------------------------------------------------------------+
| Browser / Web Worker Host (e.g., wasm-c-ide runtime.worker.js / xterm)  |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | raylib-host.js (JavaScript Runtime Bridge)                        |  |
|  | - WebGL ES 2.0 State Machine & Drawing Commands                   |  |
|  | - SharedArrayBuffer Input State Sync (Keyboard bitset, Mouse X/Y) |  |
|  | - Frame Pacing (Atomics.wait frame delay for SetTargetFPS)        |  |
|  +-----------------------------------+-------------------------------+  |
+--------------------------------------|----------------------------------+
                                       | (Wasm Imports: gl / raylib / wasi)
+--------------------------------------v----------------------------------+
| User Executable (game.wasm compiled for wasm32-wasi)                    |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | User Game Code (main.c, #include "raylib.h")                      |  |
|  +-----------------------------------+-------------------------------+  |
|                                      |                                  |
|  +-----------------------------------v-------------------------------+  |
|  | libraylib.a (compiled with -DPLATFORM_CUSTOM)                     |  |
|  | - rshapes.o, rtextures.o, rtext.o, rmodels.o, utils.o             |  |
|  | - rcore.o (rlgl built-in via RLGL_IMPLEMENTATION)                 |  |
|  | - rcore_wasi.o (Custom Platform: InitPlatform, PollInputEvents)   |  |
|  | - gl_wasi.o (GLES2 C wrappers & Wasm extern imports)             |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

---

## 📦 Directory Structure

```
.
├── SPEC.md                    # Technical specification & architectural ground truth
├── AGENTS.md                  # Development guidelines & milestone roadmap
├── Makefile                   # Main build script (compiles libraylib.a, host, examples)
├── vendor/
│   └── raylib/                # Clean Git submodule tracking raysan5/raylib (tag 5.5)
├── src/
│   ├── rcore_wasi.c           # Raylib PLATFORM_CUSTOM implementation for WASI
│   ├── gl_wasi.h              # Minimal OpenGL ES 2.0 declarations & constants for Wasm
│   ├── gl_wasi.c              # GLES2 C wrappers (glGetString, logs) and import bindings
│   ├── GLES2/
│   │   ├── gl2.h              # Forwarding header to ../gl_wasi.h for zero-diff rlgl.h support
│   │   └── gl2ext.h           # Forwarding header to ../gl_wasi.h
│   └── host/
│       ├── index.js           # Host bridge entry point
│       ├── gl-context.js      # WebGL state machine and handle tables
│       ├── input.js           # SharedArrayBuffer keyboard & mouse event synchronization
│       └── wasi.js            # Standard WASI snapshot preview 1 runtime
├── examples/
│   ├── core_basic_window.c    # Minimal window & text example
│   ├── shapes_basic_shapes.c  # 2D shapes rendering example
│   ├── core_input_keys.c      # Interactive keyboard/mouse movement example
│   ├── index.html             # Browser test harness
│   └── worker.js              # Web Worker runtime harness
├── test/
│   ├── host.test.js           # Unit tests for WebGL dispatcher and handle tables
│   └── symbols.test.js        # Validates exported/imported symbols in libraylib.a
└── dist/                      # Packaged release output
    ├── include/               # raylib.h, raymath.h, rlgl.h
    ├── lib/                   # libraylib.a
    └── raylib-host.js         # Bundled standalone host runtime bridge
```

---

## 🚀 Quickstart & Build Instructions

### Prerequisites
- **LLVM / Clang 19+** (or `wasi-sdk`)
- **wasi-libc** (installed at `/usr/include/wasm32-wasi` and `/usr/lib/wasm32-wasi`)
- **llvm-ar**
- **Node.js 20+**

On Debian / Ubuntu:
```bash
sudo apt-get update
sudo apt-get install -y clang llvm lld wasi-libc zip
```

### Build Everything
```bash
git submodule update --init --recursive
make all
```

This compiles:
- `dist/lib/libraylib.a`
- `dist/include/` (`raylib.h`, `raymath.h`, `rlgl.h`)
- `dist/raylib-host.js`

### Build Example Binaries
```bash
make examples
```
Generates:
- `examples/core_basic_window.wasm`
- `examples/shapes_basic_shapes.wasm`
- `examples/core_input_keys.wasm`

### Run Test Suites
```bash
make test
```
Runs both unit test suites (`host.test.js` and `symbols.test.js`).

### Create Release Archives
```bash
make package
```
Generates `dist/raylib-wasi.tar.gz` and `dist/raylib-wasi.zip`.

---

## 💻 Compiling Your Own Game with raylib-wasi

To compile any Raylib C code into a `wasm32-wasi` binary:

```bash
clang --target=wasm32-wasi -nodefaultlibs -lc \
  -Idist/include \
  main.c dist/lib/libraylib.a \
  -o game.wasm
```

---

## 🌐 Running in the Browser (Web Worker)

`raylib-wasi` is designed to run synchronously inside a Web Worker using `raylib-host.js`:

```javascript
import { createRaylibHost } from './dist/raylib-host.js';

// Inside worker.js:
const offscreenCanvas = ...; // Transferred from main thread
const sharedBuffer = ...;    // SharedArrayBuffer (512 bytes)

const host = createRaylibHost({
  canvas: offscreenCanvas,
  sharedBuffer: sharedBuffer,
  width: 800,
  height: 450
});

const wasmResponse = await fetch('game.wasm');
const wasmBinary = await wasmResponse.arrayBuffer();

// Run the synchronous game loop
await host.run(wasmBinary);
```

On the main UI thread:
```javascript
import { createRaylibHost } from './dist/raylib-host.js';

const canvas = document.getElementById('my-canvas');
const offscreen = canvas.transferControlToOffscreen();
const sharedBuffer = new SharedArrayBuffer(512);

// Sync input events from DOM to SharedArrayBuffer
const hostSync = createRaylibHost({ sharedBuffer, width: 800, height: 450 });
hostSync.input.attachListeners(canvas);

// Launch worker
const worker = new Worker('worker.js', { type: 'module' });
worker.postMessage({ canvas: offscreen, sharedBuffer }, [offscreen]);
```

---

## 📄 License
- **raylib-wasi**: zlib/libpng license (matches upstream Raylib).
- **Raylib**: Copyright (c) 2013-2024 Ramon Santamaria (@raysan5).

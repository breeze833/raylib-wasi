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

## 📦 Downloading & Integrating raylib-wasi into Your Project

### Option 1: Download Precompiled Release Bundle

Precompiled archives containing `include/`, `lib/libraylib.a`, and `raylib-host.js` are published on GitHub Releases:

- 👉 **[GitHub Releases Page](https://github.com/breeze833/raylib-wasi/releases)**

To download and extract the latest build directly in your terminal:

```bash
# Download and extract the latest tarball
curl -LO https://github.com/breeze833/raylib-wasi/releases/download/latest/raylib-wasi.tar.gz
tar -xzf raylib-wasi.tar.gz

# Archive contents:
# ├── include/
# │   ├── raylib.h
# │   ├── raymath.h
# │   └── rlgl.h
# ├── lib/
# │   └── libraylib.a
# ├── raylib-host.js
# └── raylib-host.d.ts
```

### Option 2: Install via npm (for Web IDEs & Web Apps)

You can install `@breeze833/raylib-wasi` into any Node.js / web project (like `wasm-c-ide`):

**From GitHub repository directly**:
```bash
npm install https://github.com/breeze833/raylib-wasi
```
*(An automatic zero-dependency `postinstall` script downloads the precompiled `libraylib.a` and headers from GitHub Releases, requiring no local C compiler or Clang toolchain).*

**Or from GitHub Packages**:
```bash
npm install @breeze833/raylib-wasi
```

Then import the host runtime bridge directly in your JavaScript / TypeScript code:

```javascript
import { createRaylibHost } from '@breeze833/raylib-wasi';
```

And access the precompiled headers and static library for Wasm compilation at:
- Header files: `node_modules/@breeze833/raylib-wasi/dist/include/`
- Static archive: `node_modules/@breeze833/raylib-wasi/dist/lib/libraylib.a`

### Option 3: Git Submodule (Source Integration)

If you prefer building from source in your repository:

```bash
git submodule add https://github.com/breeze833/raylib-wasi vendor/raylib-wasi
cd vendor/raylib-wasi && make all
```

---

## 💻 Compiling Your Own Game with raylib-wasi

To compile any Raylib C code into a `wasm32-wasi` binary:

```bash
clang --target=wasm32-wasi -nodefaultlibs -lc \
  -Iinclude \
  main.c lib/libraylib.a \
  -o game.wasm
```

---

## 🌐 Integrating raylib-wasi in Web Applications & Web IDEs

Because standard Raylib programs run in a continuous synchronous loop (`while (!WindowShouldClose()) { ... }`), running them on the browser's main UI thread will freeze the browser tab. `raylib-wasi` is engineered specifically for execution inside **Web Workers** (such as the terminal emulator worker in `wasm-c-ide`), using `SharedArrayBuffer` for frame pacing (`Atomics.wait`) and input synchronization.

### 🎨 Canvas Update Architecture: Zero-Copy `ImageBitmap` Transfer

> [!IMPORTANT]
> **Why `transferControlToOffscreen()` cannot be used**:
> When an `HTMLCanvasElement` is transferred to a worker via `canvas.transferControlToOffscreen()`, the browser only commits rendered frames to the screen during the worker's JavaScript **event loop checkpoint** ("Update the rendering" step). Since Raylib's synchronous C loop never yields the call stack back to the worker event loop, and legacy `gl.commit()` was deprecated and removed from modern browser WebGL standards, placeholder canvases will remain permanently blank.
>
> **The Correct Rendering Method**:
> 1. The **main thread** owns the onscreen `<canvas>` and initializes an `ImageBitmapRenderingContext` (`canvas.getContext('bitmaprenderer')`).
> 2. The **Web Worker** creates an independent `OffscreenCanvas` (`new OffscreenCanvas(width, height)`).
> 3. On every frame swap (`raylib_host_swap_buffers`), `raylib-host.js` captures a GPU-backed `ImageBitmap` via `canvas.transferToImageBitmap()`.
> 4. The worker transfers the bitmap to the main thread via `postMessage({ type: 'frame', bitmap }, [bitmap])` (zero-copy GPU buffer transfer).
> 5. The main thread immediately renders the bitmap via `ctx.transferFromImageBitmap(bitmap)`.

---

### Step-by-Step Integration

#### 1. Main Thread (`index.html` / `main.js`)

```javascript
import { createRaylibHost } from './dist/raylib-host.js';

const canvas = document.getElementById('raylib-canvas');

// 1. Initialize high-performance bitmap renderer on DOM canvas
const ctx = canvas.getContext('bitmaprenderer');

// 2. Allocate 512-byte SharedArrayBuffer for synchronous input and frame pacing
const sharedBuffer = new SharedArrayBuffer(512);

// 3. Attach DOM keyboard and mouse event listeners to SharedArrayBuffer
const hostInput = createRaylibHost({
  sharedBuffer,
  width: 800,
  height: 450
});
hostInput.input.attachListeners(canvas);

// 4. Spawn Web Worker
const worker = new Worker('worker.js', { type: 'module' });

// 5. Handle worker messages (render incoming frames and capture logs)
worker.onmessage = (e) => {
  const { type, bitmap, text, fps, error } = e.data;
  if (type === 'frame') {
    // Zero-copy transfer of rendered GPU frame directly to canvas
    ctx.transferFromImageBitmap(bitmap);
  } else if (type === 'fps') {
    console.log(`Current FPS: ${fps}`);
  } else if (type === 'log') {
    console.log(`[Raylib] ${text}`);
  } else if (type === 'err' || type === 'error') {
    console.error(`[Raylib Error] ${text || error}`);
  }
};

// 6. Start game execution
worker.postMessage({
  wasmUrl: 'game.wasm',
  sharedBuffer,
  width: 800,
  height: 450
});
```

#### 2. Worker Thread (`worker.js`)

```javascript
import { createRaylibHost } from './dist/raylib-host.js';

self.onmessage = async (e) => {
  const { wasmUrl, sharedBuffer, width = 800, height = 450 } = e.data;

  // 1. Create worker-owned OffscreenCanvas (NOT transferred from DOM)
  const canvas = new OffscreenCanvas(width, height);
  const gl = canvas.getContext('webgl', {
    alpha: false,
    depth: true,
    stencil: true,
    antialias: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false
  });

  // 2. Initialize host runtime bridge
  const host = createRaylibHost({
    canvas,
    gl,
    sharedBuffer,
    width,
    height,
    print: (text) => self.postMessage({ type: 'log', text }),
    printErr: (text) => self.postMessage({ type: 'err', text }),
    onFrame: (bitmap) => {
      // Transfer captured GPU ImageBitmap to main thread
      if (bitmap) {
        self.postMessage({ type: 'frame', bitmap }, [bitmap]);
      }
    },
    onClose: () => {
      self.postMessage({ type: 'status', status: 'closed' });
    }
  });

  // 3. Fetch and execute the WebAssembly binary
  try {
    const response = await fetch(wasmUrl);
    const wasmBinary = await response.arrayBuffer();
    self.postMessage({ type: 'status', status: 'running' });
    
    // Starts the synchronous game loop (returns when WindowShouldClose() becomes true)
    await host.run(wasmBinary);
    
    self.postMessage({ type: 'status', status: 'finished' });
  } catch (err) {
    if (err.exitCode === 0) {
      self.postMessage({ type: 'status', status: 'exited_0' });
    } else {
      self.postMessage({ type: 'error', error: err.message });
    }
  }
};
```

---

### 🔒 Required HTTP Security Headers (COOP / COEP)

Browsers enforce cross-origin isolation as a strict security requirement for `SharedArrayBuffer` and `Atomics.wait()`. Your web server must send the following HTTP response headers:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

#### Local Development Server
- **Node.js**: Run `make serve` (starts `scripts/serve.js` on port `8080` with COOP/COEP headers).
- **PHP**: Run `php -S 127.0.0.1:8080 router.php`.
- **Nginx**:
  ```nginx
  add_header Cross-Origin-Opener-Policy same-origin always;
  add_header Cross-Origin-Embedder-Policy require-corp always;
  ```
- **Apache (`.htaccess`)**:
  ```apache
  Header set Cross-Origin-Opener-Policy "same-origin"
  Header set Cross-Origin-Embedder-Policy "require-corp"
  ```

---

## 📄 License
- **raylib-wasi**: zlib/libpng license (matches upstream Raylib).
- **Raylib**: Copyright (c) 2013-2024 Ramon Santamaria (@raysan5).


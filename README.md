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
- **Modular & Standalone Host Bridge**: Modular ES package (`src/host/index.js`) delegating WASI Preview 1 hosting to [`wasi-host`](https://github.com/breeze833/wasi-host) (or an externally injected `wasiHost` / `wasiImports`), alongside a self-contained single-file browser/release bundle (`dist/raylib-host.js`) supplying `"gl"`, `"raylib"`, `"audio"`, `"wasi_snapshot_preview1"`, and `"wasi_unstable"` namespaces to `WebAssembly.instantiate`.
- **Hardware-Decoupled Web Audio Subsystem**: Full Raylib audio API (`InitAudioDevice`, `Sound`, `Wave`, `Music`, `AudioStream`) implemented via `src/raudio_wasi.c` and Web Audio API (`AudioContext`). Because Web Audio runs on its own dedicated hardware thread, audio playback remains crystal-clear and immune to single-thread frame pacing fluctuations.
- **Virtual Filesystem Ready (`dist/headers.js`)**: C headers (`raylib.h`, `raymath.h`, `rlgl.h`, `raygui.h`) are packaged as string constants for instant virtual filesystem mounting in in-browser IDEs (such as `wasm-c-ide`) without external network requests.
- **Self-Contained GUI Support**: Includes `raygui.h` immediate-mode GUI widgets out of the box for building toolbars, buttons, sliders, and controls in pure C.
- **Injectable Input Coordinator**: Supports sharing an external `InputCoordinator` (such as `canvas-wasi`'s coordinator) over the standard 512-byte `SharedArrayBuffer` layout.
- **Standalone Reference Host & Contract Specification**: Authoritative host function contract in `docs/HOST_FUNCTIONS.md` and a headless reference runner in `examples/host-reference.js` with integrated self-verification.
- **Zero-Binary Repository Policy**: Neither compiled binary `.a` archives nor upstream header copies are tracked in Git; distributions are published exclusively on GitHub Releases and headers are generated at build time.

---

## 🏗️ Architecture

```
+-------------------------------------------------------------------------------+
| Browser Host (Main Thread & Web Worker, e.g. wasm-c-ide runtime.worker.js)   |
|                                                                               |
|  +-------------------------------------------------------------------------+  |
|  | src/host/index.js  /  dist/raylib-host.js (JavaScript Runtime Bridge)    |  |
|  | - WebGL ES 2.0 State Machine & Drawing Commands                         |  |
|  | - SharedArrayBuffer Input State Sync (Keyboard bitset, Mouse X/Y)       |  |
|  | - Frame Pacing (Atomics.wait frame delay for SetTargetFPS)              |  |
|  | - Web Audio API Engine & Handles (createAudioImports / AudioReceiver)   |  |
|  |   * Hardware-decoupled AudioContext & Gain/Pan/Voice nodes              |  |
|  |   * PCM buffer decoding & streaming audio chunk queueing                |  |
|  | - WASI Preview 1 Hosting (wasi-host or external wasiHost / wasiImports) |  |
|  +------------------------------------+------------------------------------+  |
+---------------------------------------|---------------------------------------+
                                        | (Wasm Imports: gl / raylib / wasi)
+---------------------------------------v---------------------------------------+
| User Executable (game.wasm compiled for wasm32-wasi)                          |
|                                                                               |
|  +-------------------------------------------------------------------------+  |
|  | User Game Code (main.c, #include "raylib.h", #include "raygui.h")       |  |
|  +------------------------------------+------------------------------------+  |
|                                       |                                       |
|  +------------------------------------v------------------------------------+  |
|  | libraylib.a (compiled with -DPLATFORM_CUSTOM)                           |  |
|  | - rshapes.o, rtextures.o, rtext.o, rmodels.o, utils.o                   |  |
|  | - rcore.o (rlgl built-in via RLGL_IMPLEMENTATION)                       |  |
|  | - rcore_wasi.o (Custom Platform: InitPlatform, PollInputEvents)         |  |
|  | - gl_wasi.o (GLES2 C wrappers & Wasm extern imports)                   |  |
|  | - raudio_wasi.o (Raylib Audio API: Sound, Wave, Music, AudioStream,     |  |
|  |                  dr_wav/dr_mp3/stb_vorbis/dr_flac/qoa decoders)         |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
```

---

## 📦 Directory Structure

```
.
├── SPEC.md                    # Technical specification & architectural ground truth
├── AGENTS.md                  # Development guidelines & milestone roadmap
├── Makefile                   # Main build script (compiles libraylib.a, host, examples)
├── docs/
│   └── HOST_FUNCTIONS.md      # Authoritative Wasm host function contract & specifications
├── vendor/
│   └── raylib/                # Clean Git submodule tracking raysan5/raylib (tag 5.5)
├── src/
│   ├── rcore_wasi.c           # Raylib PLATFORM_CUSTOM implementation for WASI
│   ├── gl_wasi.h              # Minimal OpenGL ES 2.0 declarations & constants for Wasm
│   ├── gl_wasi.c              # GLES2 C wrappers (glGetString, logs) and import bindings
│   ├── raudio_wasi.c          # Dedicated Raylib audio API implementation for WASI Preview 1
│   ├── GLES2/
│   │   ├── gl2.h              # Forwarding header to ../gl_wasi.h for zero-diff rlgl.h support
│   │   └── gl2ext.h           # Forwarding header to ../gl_wasi.h
│   └── host/
│       ├── index.js           # Host bridge entry point (delegates WASI to wasi-host)
│       ├── gl-context.js      # WebGL state machine and handle tables
│       ├── input.js           # SharedArrayBuffer keyboard & mouse event synchronization
│       └── audio-context.js   # Web Audio API bridge, handle tables, and audio receiver
├── scripts/
│   ├── bundle-host.js         # Bundles src/host/*.js + wasi-host into dist/raylib-host.js
│   ├── postinstall.js         # Downloads release assets when prebuilt dist/ files are absent
│   ├── serve.js               # Local dev HTTP server with COOP/COEP headers
│   └── setup-wasi-sdk.js      # Downloads and configures self-contained wasi-sdk v29
├── examples/
│   ├── host-reference.js      # Production-grade reference runner with self-verification
│   ├── core_basic_window.c    # Minimal window & text example
│   ├── shapes_basic_shapes.c  # 2D shapes rendering example
│   ├── core_input_keys.c      # Interactive keyboard/mouse movement example
│   ├── audio_sound_loading.c  # Interactive procedural wave synthesis & audio playback demo
│   ├── gui_controls.c         # Immediate-mode GUI demo using raygui.h
│   ├── index.html             # Browser test harness
│   └── worker.js              # Web Worker runtime harness
├── test/
│   ├── host.test.js           # Unit tests for WebGL, Web Audio, and handle tables
│   └── symbols.test.js        # Validates exported/imported symbols in libraylib.a
└── dist/                      # Packaged release output
    ├── include/               # raylib.h, raymath.h, rlgl.h, raygui.h (copied on build)
    ├── lib/                   # libraylib.a (compiled on build / CI release asset)
    ├── headers.js             # Exported C headers string constants (RAYLIB_H, etc.)
    ├── headers.d.ts           # Type declarations for headers.js
    ├── raylib-host.js         # Bundled standalone host runtime bridge
    └── raylib-host.d.ts       # Type declarations for raylib-host.js
```

---

## 🚀 Quickstart & Build Instructions

### Prerequisites
- **Node.js 20+**
- (Optional) Host **LLVM / Clang 19+** and **wasi-libc** if not using the self-contained toolchain

### Self-Contained Toolchain Setup (`wasi-sdk v29`)
The build process includes a self-contained toolchain installer that downloads and configures pre-built `wasi-sdk v29` (including Clang, llvm-ar, and wasi-libc sysroot) into `.wasi-sdk/` for Linux (x86_64, arm64) and macOS (Apple Silicon, Intel):

```bash
make toolchain
# or: npm run toolchain
```

### Build Everything
```bash
git submodule update --init --recursive
npm install
make all
```

This compiles and bundles:
- `dist/lib/libraylib.a`
- `dist/include/` (`raylib.h`, `raymath.h`, `rlgl.h`, `raygui.h`)
- `dist/headers.js`
- `dist/raylib-host.js` (self-contained bundle incorporating `wasi-host`)

### Build Example Binaries
```bash
make examples
```
Generates:
- `examples/core_basic_window.wasm`
- `examples/shapes_basic_shapes.wasm`
- `examples/core_input_keys.wasm`
- `examples/audio_sound_loading.wasm`
- `examples/gui_controls.wasm`

### Run Test Suites
```bash
make test
# or: npm test
```
Runs:
1. `test/host.test.js`: WebGL, WASI Preview 1, and Web Audio API unit tests.
2. `test/symbols.test.js`: Static library export validation & Wasm import namespace checks.
3. `examples/host-reference.js`: End-to-end headless reference host self-verification against all example binaries.

You can also run the standalone reference host runner directly on any Wasm binary:
```bash
node examples/host-reference.js examples/core_basic_window.wasm 60
# or: npm run host-reference
```

### Host Function Specification
The authoritative Wasm host-assisted function specification and binary contract are documented in **[`docs/HOST_FUNCTIONS.md`](docs/HOST_FUNCTIONS.md)**.

### Create Release Archives
```bash
make package
```
Generates `dist/raylib-wasi.tar.gz`, `dist/raylib-wasi.zip`, and the npm package tarball `dist/raylib-wasi-5.5.0-build1.tgz`.

---

## 📦 Downloading & Integrating raylib-wasi into Your Project

### Option 1: Download Precompiled Release Bundle from GitHub Releases (Recommended)

Precompiled distributions containing `include/`, `lib/libraylib.a`, and `raylib-host.js` are published exclusively on GitHub Releases:

- 👉 **[GitHub Releases Page](https://github.com/breeze833/raylib-wasi/releases)**

To download and extract the latest release archive directly in your terminal:

```bash
# Download and extract the latest tarball
curl -LO https://github.com/breeze833/raylib-wasi/releases/download/latest/raylib-wasi.tar.gz
tar -xzf raylib-wasi.tar.gz

# Archive contents:
# ├── include/
# │   ├── raylib.h
# │   ├── raymath.h
# │   ├── rlgl.h
# │   └── raygui.h
# ├── lib/
# │   └── libraylib.a
# ├── headers.js
# ├── headers.d.ts
# ├── raylib-host.js
# └── raylib-host.d.ts
```

### Option 2: Web Applications & In-Browser IDE Integration (e.g. `wasm-c-ide`)

For npm/Vite/bundler projects (such as `wasm-c-ide`), install the release tarball directly so `wasi-host` is shared and deduplicated across subsystems:

```bash
npm install https://github.com/breeze833/raylib-wasi/releases/download/latest/raylib-wasi-5.5.0-build1.tgz
```

```javascript
// Import from the modular package entrypoint (delegates WASI to shared wasi-host)
import { createRaylibHost, RaylibReferenceHost, createMockGL, createGLImports, createAudioReceiver, InputCoordinator } from 'raylib-wasi';

// Import C headers as string constants (e.g. for VFS mounting in browser IDEs)
import { RAYLIB_H, RAYMATH_H, RLGL_H, RAYGUI_H } from 'raylib-wasi/headers';
```

For zero-bundler static browser environments (direct `<script type="module">` or standalone Worker), use the pre-bundled single-file `./dist/raylib-host.js` and `./dist/headers.js` from `raylib-wasi.tar.gz` / GitHub Releases.

#### Host Bridge Configuration Options
```javascript
const host = createRaylibHost({
  canvas,               // HTMLCanvasElement or worker OffscreenCanvas
  gl,                   // Optional pre-created WebGLRenderingContext
  sharedBuffer,         // 512-byte SharedArrayBuffer for zero-copy sync
  inputCoordinator,     // Optional: inject external coordinator (e.g. from canvas-wasi)
  wasiHost,             // Optional: inject external WasiHost instance (e.g. shared OverlayVFS + stdin-wasi)
  wasiImports,          // Optional: inject raw wasi_snapshot_preview1 syscall map (ignored if wasiHost is set)
  vfs,                  // Optional VFS (OverlayVFS, Map, or object) when using built-in WasiHost fallback
  cwd: '/',             // Optional working directory for built-in WasiHost fallback
  argv: ['raylib'],     // Optional argv array for built-in WasiHost fallback
  environ,              // Optional environment variables for built-in WasiHost fallback
  preopens,             // Optional WASI preopens for built-in WasiHost fallback
  stdin,                // Optional stdin source (string, Uint8Array, or stdin-wasi reader)
  print: (line) => {},  // Line-buffered stdout callback for built-in WasiHost fallback
  printErr: (line) => {}, // Line-buffered stderr callback for built-in WasiHost fallback
  onExit: (code) => {}, // Exit callback invoked on proc_exit(code)
  onFrame: (bitmap) => {
    // Deliver ImageBitmap frame synchronously to main thread
  },
  onFPS: (fps) => {
    // Rolling 1-second FPS metric
  },
  onInitWindow: (width, height, title) => {
    // Notification when game calls InitWindow(w, h, title)
  },
  onClose: () => {
    // Notification when game closes or WindowShouldClose() becomes true
  },
  onAudioMessage: (msg, transfer) => {
    // Forward audio events from worker to main-thread createAudioReceiver
  }
});
```

### Option 3: Git Submodule (Source Integration)

If you prefer building from source in your repository:

```bash
git submodule add https://github.com/breeze833/raylib-wasi vendor/raylib-wasi
cd vendor/raylib-wasi && npm install && make all
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


# Software Specification: raylib-wasi (Vanilla Raylib on wasm32-wasi without Emscripten)

## 1. Project Overview & Objectives
`raylib-wasi` is a standalone, open-source port and build distribution of **Raylib** targeting pure WebAssembly with WASI (`wasm32-wasi` / `wasm32-wasip1`), completely independent of Emscripten.

### Key Objectives:
- **Zero Emscripten Dependency**: Build using standard LLVM/Clang and `wasi-libc` / `wasi-sdk` targeting `wasm32-wasi`.
- **Zero-Diff Upstream Maintenance**: Upstream `raysan5/raylib` is tracked as an untouched Git submodule. Not a single line of Raylib's core source code is modified or patched.
- **Raylib 5.5 `PLATFORM_CUSTOM` Architecture**: Leverage Raylib's official platform-split architecture by providing a custom platform adapter (`rcore_wasi.c`).
- **Synchronous Web Worker Execution (wasm-c-ide integration)**: Enable standard Raylib loops (`while (!WindowShouldClose())`) to run inside a Web Worker (such as an xterm terminal emulator process in `wasm-c-ide`) without freezing the browser, using `SharedArrayBuffer` and `Atomics.wait()` for frame pacing and input synchronization.
- **Dual Deliverables**:
  1. `libraylib.a` + standard headers (`raylib.h`, `raymath.h`, `rlgl.h`) for compilation into user binaries.
  2. `raylib-host.js`: A lightweight, zero-dependency vanilla ES module host bridge supplying WebGL and input imports to `WebAssembly.instantiate` in browser or worker contexts.

---

## 2. System Architecture

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
| User Executable (a.out / game.wasm compiled for wasm32-wasi)            |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | User Game Code (main.c, #include "raylib.h")                      |  |
|  +-----------------------------------+-------------------------------+  |
|                                      |                                  |
|  +-----------------------------------v-------------------------------+  |
|  | libraylib.a (compiled with -DPLATFORM_CUSTOM)                     |  |
|  | - rshapes.o, rtextures.o, rtext.o, rmodels.o                      |  |
|  | - rcore.o (rlgl built-in via RLGL_IMPLEMENTATION)                 |  |
|  | - rcore_wasi.o (Custom Platform: InitPlatform, PollInputEvents)   |  |
|  | - gl_wasi.o (GLES2 C wrappers & Wasm extern imports)             |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

---

## 3. Detailed Component Specifications

### 3.1 Upstream Source Integration
- Track upstream `raysan5/raylib` as a Git submodule under `vendor/raylib/`.
- Target: Raylib `5.5` release tag.
- Unmodified upstream files compiled into `libraylib.a`:
  - `vendor/raylib/src/rshapes.c`
  - `vendor/raylib/src/rtextures.c`
  - `vendor/raylib/src/rtext.c`
  - `vendor/raylib/src/rmodels.c`
  - `vendor/raylib/src/rcore.c` (with `-DPLATFORM_CUSTOM -DGRAPHICS_API_OPENGL_ES2`)
- Note on Audio: `raudio.c` is omitted from the initial milestones (compiled with audio disabled or stubs), as `miniaudio.h` does not support vanilla `wasm32-wasi` without custom host audio bindings.
- Note on `rlgl`: `rlgl.h` is a header-only component whose implementation is compiled directly inside `rcore.o` (`#define RLGL_IMPLEMENTATION`).

### 3.2 Platform Implementation (`src/rcore_wasi.c`)
Raylib's `PLATFORM_CUSTOM` requires implementing standard hooks defined in `rcore_template.c`:
- **`InitPlatform()`**:
  - Calls host import `raylib_host_init_window(width, height, title)`.
  - Queries screen dimensions, DPI scale, and framebuffer sizes from the host.
  - Initializes `CORE.Window` state and sets `CORE.Window.ready = true`.
- **`ClosePlatform()`**:
  - Calls host import `raylib_host_close_window()`.
- **`PollInputEvents()`**:
  - Reads synchronous input state from host-mapped `SharedArrayBuffer`:
    - Keyboard: 512-bit key state array (pressed, down, released).
    - Mouse: position `(x, y)`, delta, wheel move, and button states.
    - Touch / Gamepad (optional).
- **`SwapScreenBuffer()`**:
  - Flushes WebGL draw calls.
  - Signals frame completion to host.
- **`WaitTime(double seconds)` Frame Clamping**:
  - In `rcore.c`, `WaitTime` has no `__wasi__` support and would normally compile as an unthrottled no-op.
  - `rcore.c` is compiled with `-DWaitTime=Raylib_Internal_WaitTime`, and `src/rcore_wasi.c` provides the active `WaitTime(double seconds)` definition.
  - Invokes host `raylib_host_sleep(ms)` via `Atomics.wait()` on `SharedArrayBuffer` (or WASI `poll_oneoff` / `nanosleep`), ensuring `SetTargetFPS(60)` clamps frames without consuming 100% CPU on the worker thread.
- **Window and Input Hooks**:
  - Implements `WindowShouldClose()`, `SetWindowTitle()`, `GetWindowScaleDPI()`, `SetMousePosition()`, `SetMouseCursor()`, etc.
  - Mirrors internal `CoreData` structures to link with `extern CoreData CORE`.

### 3.3 OpenGL ES 2.0 / WebGL Host Bindings (`src/gl_wasi.c`, `src/gl_wasi.h`, and `src/GLES2/`)
- Upstream `rlgl.h` includes `<GLES2/gl2.h>` and `<GLES2/gl2ext.h>`.
- To preserve the Zero-Diff Upstream Rule without modifying `rlgl.h`:
  - `src/GLES2/gl2.h` and `src/GLES2/gl2ext.h` are provided in `src/`, forwarding directly to `src/gl_wasi.h`.
- **C Wrapper & Import Architecture**:
  - Direct scalar and numeric buffer functions are declared with:
    ```c
    __attribute__((import_module("gl"), import_name("glClear")))
    void glClear(unsigned int mask);
    ```
  - **C Wrappers for String & Pointer Marshalling**:
    Calls requiring pointer and string translation across the Wasm/JS boundary (such as `glGetString`, `glGetShaderInfoLog`, `glGetProgramInfoLog`, `glShaderSource`, and `glGetUniformLocation`) use C wrapper functions in `src/gl_wasi.c`.
    - For example, `glGetString(GL_EXTENSIONS)` or `glGetString(GL_VERSION)` uses static C buffers populated by concise host imports, ensuring zero pointer confusion and eliminating the need for complex JavaScript-side Wasm heap allocators.

### 3.4 Host Runtime Bridge (`dist/raylib-host.js`) & Module Exports
A standalone, zero-dependency ES module providing import namespaces to `WebAssembly.instantiate`:
- **Module Exports (`package.json`)**:
  - `.` / `./host`: `dist/raylib-host.js` exporting `createRaylibHost`, `createGLImports`, `InputCoordinator`, `createWasiImports`.
  - `./headers`: `dist/headers.js` exporting `RAYLIB_H`, `RAYMATH_H`, and `RLGL_H` as JavaScript string constants for virtual filesystems.
  - `./include/*`: Direct file access to C headers (`dist/include/raylib.h`, etc.).
  - `./lib/*`: Precompiled static archives when installed with binary assets.
- **Module Namespaces**:
  - `"gl"`: WebGL ES 2.0 bindings and handle table translations.
  - `"raylib"`: Window lifecycle (`raylib_host_init_window`, `raylib_host_close_window`), screen query functions, and timing (`raylib_host_sleep`).
  - `"wasi_snapshot_preview1"`: Standard WASI runtime environment.
- **WebGL Dispatcher**:
  - Maps integer IDs (1, 2, 3...) to WebGL objects (`WebGLBuffer`, `WebGLTexture`, `WebGLProgram`, `WebGLShader`).
  - Supports rendering on `HTMLCanvasElement` or worker-based `OffscreenCanvas`.
- **Input Coordinator & Interoperability**:
  - Captures DOM / canvas input events (`keydown`, `keyup`, `mousemove`, `mousedown`, `mouseup`, `wheel`).
  - Synchronously updates the `SharedArrayBuffer` (512 bytes) read by `rcore_wasi.c`.
  - Supports external input coordinator injection via `createRaylibHost({ inputCoordinator })`, allowing shared input coordinator instances with host systems such as `canvas-wasi`.
  - Provides blur resets, windowTarget pop-up delegation, and explicit `reset()` lifecycle cleaning.
- **Dynamic Window Resizing & Frame Pacing**:
  - `raylib_host_init_window` dynamically resizes canvas dimensions to user-requested size (`InitWindow(w, h, title)`).
  - `raylib_host_swap_buffers` delivers frames via synchronous zero-copy `transferToImageBitmap()` without Promise tick delays.
  - Frame pacing via `Atomics.wait()` on `syncWord` in `SharedArrayBuffer` throttles `while (!WindowShouldClose())` loops to target FPS without busy-waiting.
  - Computes and emits FPS every 1000ms via `onFPS` callback.

### 3.5 Build System, Headers Generation & Packaging
- **Compiler**: Clang (LLVM 19+) targeting `wasm32-wasi`.
- **Linker & Libc**: `wasm-ld-19` / `wasm-ld` with `wasi-libc` (using `-nodefaultlibs -lc`) or standard `wasi-sdk`.
- **Compilation Flags**:
  ```bash
  -target wasm32-wasi -O2 \
  -DPLATFORM_CUSTOM \
  -DGRAPHICS_API_OPENGL_ES2 \
  -DWaitTime=Raylib_Internal_WaitTime \
  -Ivendor/raylib/src \
  -Isrc
  ```
- **Archiver**: `llvm-ar rcs dist/lib/libraylib.a ...`
- **Zero-Binary & Generated Headers Distribution Policy**:
  - `libraylib.a` is compiled in GitHub Actions CI and released as downloadable release assets on GitHub Releases (`raylib-wasi.tar.gz`), ensuring zero binary Wasm files are committed to the Git repository.
  - Public C headers (`raylib.h`, `raymath.h`, `rlgl.h`) are copied to `dist/include/` and generated as string constants in `dist/headers.js` from `vendor/raylib/src/` at build time by `scripts/bundle-host.js`. They are excluded from Git tracking (`.gitignore`), but included in published npm module distributions via `package.json`'s `files` list.
- **Output Bundle (`dist/`)**:
  ```
  dist/
  ├── include/
  │   ├── raylib.h
  │   ├── raymath.h
  │   └── rlgl.h
  ├── lib/
  │   └── libraylib.a (CI release asset)
  ├── headers.js (generated module export)
  ├── headers.d.ts
  ├── raylib-host.js
  └── raylib-host.d.ts
  ```

---

## 4. Verification & Testing Checklist

| Test Case | Expected Behavior |
|---|---|
| **Clean Submodule Build** | Submodule clone (`5.5`) + `make` builds `libraylib.a` without modifying any file in `vendor/raylib/`. |
| **Archive Symbols Verification** | `llvm-nm dist/lib/libraylib.a` contains all standard Raylib symbols (`InitWindow`, `BeginDrawing`, `DrawRectangle`, `EndDrawing`, etc.). |
| **No Unresolved Internal Symbols** | Object files link into sample binaries with only WASI (`wasi_snapshot_preview1`) and platform (`gl`, `raylib`) imports. |
| **Sample Binary: Basic Window** | `examples/core_basic_window.c` compiles to `.wasm` and runs in worker displaying a 60 FPS canvas with text. |
| **FPS Clamping (SetTargetFPS)** | `SetTargetFPS(60)` maintains ~60 FPS via `Atomics.wait()` without consuming 100% CPU on worker thread. |
| **Sample Binary: Input Handling** | Moving mouse and pressing arrow keys moves shapes on canvas in real-time. |
| **Sample Binary: 2D Shapes & Text** | Rectangles, circles, lines, and custom fonts render accurately without WebGL errors. |
| **Clean Loop Exit** | Closing window or pressing Escape causes `WindowShouldClose()` to return true and program exits with code 0. |

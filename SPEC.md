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

### 3.4 Host Runtime Bridge (`dist/raylib-host.js`)
A standalone, zero-dependency ES module providing import namespaces to `WebAssembly.instantiate`:
- **Module Namespaces**:
  - `"gl"`: WebGL ES 2.0 bindings and handle table translations.
  - `"raylib"`: Window lifecycle (`raylib_host_init_window`, `raylib_host_close_window`), screen query functions, and timing (`raylib_host_sleep`).
  - `"wasi_snapshot_preview1"`: Standard WASI runtime environment.
- **WebGL Dispatcher**:
  - Maps integer IDs (1, 2, 3...) to WebGL objects (`WebGLBuffer`, `WebGLTexture`, `WebGLProgram`, `WebGLShader`).
  - Supports rendering on `HTMLCanvasElement` or worker-based `OffscreenCanvas`.
- **Input Coordinator**:
  - Captures DOM / canvas input events (`keydown`, `keyup`, `mousemove`, `mousedown`, `mouseup`, `wheel`).
  - Synchronously updates the `SharedArrayBuffer` read by `rcore_wasi.c`.
- **Worker Execution Context**:
  - Designed for execution inside Web Workers (e.g. terminal workers in `wasm-c-ide`), allowing synchronous frame loops and `Atomics.wait()` sleep pacing.

### 3.5 Build System & Toolchain
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
- **Output Bundle (`dist/`)**:
  ```
  dist/
  ├── include/
  │   ├── raylib.h
  │   ├── raymath.h
  │   └── rlgl.h
  ├── lib/
  │   └── libraylib.a
  └── raylib-host.js
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

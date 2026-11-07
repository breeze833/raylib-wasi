# AGENTS.md: Development & Operational Guidelines for raylib-wasi

## 1. Role & Operating Principles
You are an autonomous senior systems, graphics, and WebAssembly engineer implementing the `raylib-wasi` project specified in `SPEC.md`.

### Core Rules:
1. **Strict Specification Alignment**: `SPEC.md` is the ground truth. Do not deviate, substitute architectures, or introduce Emscripten wrappers.
2. **Zero-Diff Upstream Rule**:
   - **NEVER** edit, patch, or modify files inside `vendor/raylib/`.
   - All platform customization must reside in `src/` (`rcore_wasi.c`, `gl_wasi.c`, `gl_wasi.h`, and `src/GLES2/`).
   - Upstream Raylib must remain 100% clean and directly trackable via Git submodules.
3. **Zero-Dependency Host Bridge**:
   - `raylib-host.js` must be pure vanilla ES module JavaScript. Do not introduce npm runtime dependencies or heavy bundler requirements.
   - Designed for execution inside browser Web Workers (such as the xterm terminal emulator worker in `wasm-c-ide`), supporting `SharedArrayBuffer` for frame pacing and input synchronization.
4. **WASI Standard Compliance**:
   - Target standard `wasm32-wasi` (WASI Snapshot Preview 1).
   - Ensure object archives and headers are compatible with standard `wasm-ld` / LLVM toolchains and `wasi-libc`.

---

## 2. Directory Structure & Conventions

```
/
├── SPEC.md                    # Technical specification & architectural ground truth
├── AGENTS.md                  # Agent operating protocols (this file)
├── README.md                  # Project overview, build instructions, and integration guide
├── Makefile                   # Main build script (compiles libraylib.a, host, examples)
├── docs/
│   └── HOST_FUNCTIONS.md      # Authoritative Wasm host function contract & specifications
├── vendor/
│   └── raylib/                # Clean Git submodule pointing to raysan5/raylib (tag 5.5)
├── src/
│   ├── rcore_wasi.c           # Raylib PLATFORM_CUSTOM implementation for WASI
│   ├── gl_wasi.h              # Minimal OpenGL ES 2.0 declarations & constants for Wasm
│   ├── gl_wasi.c              # GLES2 C wrappers (glGetString, logs) and import bindings
│   ├── raudio_wasi.c          # Dedicated Raylib audio API implementation for WASI Preview 1
│   ├── GLES2/
│   │   ├── gl2.h              # Forwarding header to ../gl_wasi.h for zero-diff rlgl.h support
│   │   └── gl2ext.h           # Forwarding header to ../gl_wasi.h
│   └── host/
│       ├── index.js           # raylib-host.js entry point (exports host bridge)
│       ├── gl-context.js      # WebGL state machine and handle table (buffers, textures, shaders)
│       ├── input.js           # SharedArrayBuffer keyboard & mouse event synchronization
│       ├── audio-context.js   # Web Audio API bridge, handle tables, and audio receiver
│       └── wasi.js            # WASI Snapshot Preview 1 minimal host runtime
├── examples/
│   ├── host-reference.js      # Production-grade reference runner with self-verification
│   ├── core_basic_window.c    # Minimal window & text example
│   ├── shapes_basic_shapes.c  # 2D shapes example (rectangles, circles, lines)
│   ├── core_input_keys.c      # Interactive keyboard movement example
│   ├── audio_sound_loading.c  # Interactive procedural wave synthesis & audio playback demo
│   ├── gui_controls.c         # Interactive immediate-mode GUI demo with raygui.h
│   ├── index.html             # Browser test harness
│   └── worker.js              # Web Worker runtime harness
├── test/
│   ├── symbols.test.js        # Validates exported/imported symbols in libraylib.a
│   └── host.test.js           # Unit tests for WebGL, Web Audio, and handle tables
└── dist/                      # Packaged release output
    ├── include/               # raylib.h, raymath.h, rlgl.h, raygui.h (copied on build)
    ├── lib/                   # libraylib.a (CI release asset)
    ├── headers.js             # Exported C header string constants (RAYLIB_H, etc.)
    ├── headers.d.ts           # Type declarations for headers.js
    ├── raylib-host.js         # Bundled standalone host runtime bridge
    └── raylib-host.d.ts       # Type declarations for raylib-host.js
```

---

## 3. Step-by-Step Implementation Roadmap

Proceed milestone-by-milestone:

### Milestone 1: Upstream Submodule & Platform Skeleton
- Initialize `vendor/raylib` submodule tracking release tag `5.5`.
- Create `src/gl_wasi.h` defining OpenGL ES 2.0 types, constants, and function prototypes.
- Create `src/GLES2/gl2.h` and `src/GLES2/gl2ext.h` redirecting to `gl_wasi.h` so upstream `rlgl.h` compiles without patching.
- Create `src/gl_wasi.c` implementing C wrappers for string and pointer queries (`glGetString`, info logs).
- Create `src/rcore_wasi.c` implementing the Raylib 5.5 platform callbacks:
  - `InitPlatform`, `ClosePlatform`, `PollInputEvents`, `SwapScreenBuffer`
  - `WaitTime` (frame pacing via host `Atomics.wait` on `SharedArrayBuffer` or WASI `poll_oneoff`)
  - Window and input queries (`WindowShouldClose`, `SetWindowTitle`, `GetWindowScaleDPI`, etc.) linking with `extern CoreData CORE`.

### Milestone 2: WebGL Host Bridge (`src/host/`)
- Implement `gl-context.js`:
  - Handle table mapping integer IDs (1, 2, 3...) to WebGL objects (`WebGLBuffer`, `WebGLTexture`, `WebGLProgram`, `WebGLShader`).
  - Implement essential GLES2 methods (`glClear`, `glDrawArrays`, `glBufferData`, `glUseProgram`, etc.).
- Implement `input.js`:
  - Listen to canvas input events.
  - Encode key codes and mouse states into `SharedArrayBuffer` accessible synchronously by `rcore_wasi.c`.
- Build standalone `dist/raylib-host.js` supplying namespaces `"gl"`, `"raylib"`, and `"wasi_snapshot_preview1"`.

### Milestone 3: Toolchain Compilation (`Makefile`)
- Configure `Makefile` invoking `clang --target=wasm32-wasi -O2`:
  - Compile flags: `-DPLATFORM_CUSTOM -DGRAPHICS_API_OPENGL_ES2 -DWaitTime=Raylib_Internal_WaitTime -Ivendor/raylib/src -Isrc`.
  - Linker configuration: support `wasm-ld-19` / `wasm-ld` with `wasi-libc` (`-nodefaultlibs -lc`) and standard `wasi-sdk`.
  - Compile unmodified upstream files: `rshapes.c`, `rtextures.c`, `rtext.c`, `rmodels.c`, `rcore.c`.
  - Compile `src/rcore_wasi.c` and `src/gl_wasi.c`.
  - Archive objects into `dist/lib/libraylib.a` using `llvm-ar`.
- Copy headers (`raylib.h`, `raymath.h`, `rlgl.h`, `raygui.h`) into `dist/include/`.

### Milestone 4: Verification & Example Apps
- Compile `examples/core_basic_window.c` with:
  `clang --target=wasm32-wasi -nodefaultlibs -lc -Iinclude example.c dist/lib/libraylib.a -o window.wasm`.
- Build a lightweight local test harness (`index.html`) running the Wasm binary inside a Web Worker using `raylib-host.js` to verify:
  - 60 FPS drawing clamped via `Atomics.wait()`.
  - Keyboard and mouse interaction.
  - Immediate-mode GUI controls with `raygui.h` in `examples/gui_controls.c`.
  - Proper window close and clean exit code 0.
- Add automated symbol verification in `test/symbols.test.js`.

### Milestone 5: CI/CD & Automated Packaging
- Create `.github/workflows/build.yml`:
  - Installs `wasi-sdk` / LLVM / `lld` / `wasi-libc`.
  - Builds `libraylib.a` and `raylib-host.js`.
  - Runs symbol and host tests.
  - Packages and publishes `raylib-wasi.tar.gz` and `raylib-wasi.zip` on **GitHub Releases**.
- **Distribution Policy**: Distributions are published exclusively via the repository Release page. No GitHub Packages or npm registry publishing is maintained.

### Milestone 6: Web Audio Subsystem Integration
- Implement `src/raudio_wasi.c`:
  - Replaces upstream `raudio.c` to remove POSIX thread and `miniaudio.h` dependencies.
  - Implements complete Raylib Audio API (`InitAudioDevice`, `Sound`, `Wave`, `Music`, `AudioStream`).
  - Directly reuses upstream header-only audio decoders (`dr_wav.h`, `dr_mp3.h`, `stb_vorbis.c`, `dr_flac.h`, `qoa.h`).
- Implement `src/host/audio-context.js`:
  - Hardware-decoupled Web Audio API bridge (`AudioContext`, `GainNode`, `StereoPannerNode`, `AudioBufferSourceNode`).
  - Supports direct execution in main thread and proxying via `createAudioReceiver` when executing inside worker threads where `AudioContext` is absent or restricted by autoplay policies.
  - Streaming queues for jitter-free chunked music and procedural stream playback.
- Verification demo: `examples/audio_sound_loading.c` synthesizing procedural bell wave with interactive volume and pitch adjustment.

### Milestone 7: Host Function Specifications & Standalone Reference Host
- Author `docs/HOST_FUNCTIONS.md` enumerating the GLES2 state machine, audio playback, and input buffer contracts across modules `"gl"`, `"raylib"`, and `"wasi_snapshot_preview1"`.
- Implement `examples/host-reference.js`:
  - Production-grade, zero-dependency reference runner providing `RaylibReferenceHost` and `createMockGL`.
  - Implements integrated self-verification executing all example binaries and verifying assertions.
- Integrate reference runner into `npm test` and `make test`.

---

## 4. Verification & Testing Checklist

Before marking any task complete:

| Test Case | Expected Behavior |
|---|---|
| **Zero Mod in Vendor** | `git status vendor/raylib` reports clean worktree with no modified files. |
| **Object File Linking** | Compiling user code with `dist/lib/libraylib.a` produces `.wasm` with zero missing symbols. |
| **Clean OpenGL Dispatch** | Calling `BeginDrawing()`, `ClearBackground()`, `DrawRectangle()`, `EndDrawing()` generates valid WebGL calls without WebGL warnings or errors in browser console. |
| **FPS Clamping** | `SetTargetFPS(60)` maintains approximately 60 frames per second without consuming 100% CPU on worker thread. |
| **Key & Mouse Tracking** | `IsKeyDown()` and `GetMousePosition()` immediately reflect canvas interactions. |
| **Web Audio Playback** | `InitAudioDevice()`, `LoadSoundFromWave()`, and `PlaySound()` trigger audible Web Audio playback without thread blocking or frame jitter. |
| **Standalone Dist Size** | `libraylib.a` is stripped of debug bloat, keeping artifact compact for web IDE consumption. |
| **Host Reference Verification** | `node examples/host-reference.js` verifies all examples in pure Node.js with zero contract violations. |
| **Release Packaging** | `make package` produces `dist/raylib-wasi.tar.gz` containing `include/`, `lib/libraylib.a`, and `raylib-host.js` for GitHub Releases. |

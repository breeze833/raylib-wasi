# WebAssembly Host-Assisted Functions Specification

This document is the authoritative technical specification and binary contract between compiled `raylib-wasi` WebAssembly binaries (targeting `wasm32-wasip1`) and any host runtime (such as `raylib-host.js`, browser Web Workers, headless Node.js test runners, or `wasm-c-ide`).

---

## 1. Architectural Overview & Component Provider Model

`raylib-wasi` executes native Raylib code inside standard single-threaded WASI Preview 1 runtimes without Emscripten. Because WebAssembly sandboxes cannot directly access GPU hardware, audio devices, or host display event loops, `raylib-wasi` relies on host-assisted functions partitioned across three designated Wasm import modules:

1. **`gl`**: Hardware-accelerated OpenGL ES 2.0 / WebGL rasterization, shader compilation, and GPU resource management.
2. **`raylib`**: Platform lifecycle (windowing, display swap), synchronous input state synchronization, frame pacing, and the hardware-decoupled Web Audio API subsystem.
3. **`wasi_snapshot_preview1`** (also aliased as **`wasi_unstable`**): Standard POSIX/WASI Preview 1 system calls (console I/O, virtual filesystem, monotonic clocks, process termination, environment queries), delegated by default to [`wasi-host`](https://github.com/breeze833/wasi-host) or an externally injected `wasiHost` / `wasiImports`.

```
+-----------------------------------------------------------------------------------+
| Host Runtime (Browser Main Thread / Web Worker / Node.js Runner)                  |
|                                                                                   |
|  +--------------------+  +--------------------+  +-----------------------------+  |
|  | WebGL ES 2.0 / Mock|  | InputCoordinator   |  | Web Audio API / Receiver    |  |
|  | Handle Tables      |  | SharedArrayBuffer  |  | Voice & Stream Queues       |  |
|  +---------+----------+  +---------+----------+  +--------------+--------------+  |
+------------|-----------------------|----------------------------|-----------------+
             |                       |                            |
  (Module: "gl")          (Module: "raylib")           (Module: "raylib" / "audio")
+------------|-----------------------|----------------------------|-----------------+
| WebAssembly Linear Memory & Executable Instance (wasm32-wasip1)                   |
|                                                                                   |
|  +--------------------+  +--------------------+  +-----------------------------+  |
|  | src/gl_wasi.c/.h   |  | src/rcore_wasi.c   |  | src/raudio_wasi.c           |  |
|  | GLES2 C Bindings   |  | WasiInputState     |  | Pure C Decoders (WAV/MP3/..)|  |
|  +--------------------+  +--------------------+  +-----------------------------+  |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Upstream Raylib 5.5 (rcore.o, rshapes.o, rtextures.o, rtext.o, rmodels.o)   |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

### Memory & Type Representation
- All pointers (`ptr`) are unsigned 32-bit integers (`i32`) representing byte offsets within the instance's linear memory (`exports.memory.buffer`).
- Numeric values are encoded in little-endian byte order matching the WASI 32-bit specification.
- String arguments are UTF-8 encoded byte sequences in Wasm linear memory.

---

## 2. Platform & Lifecycle Host Functions (`raylib` Module)

These functions manage the application lifecycle, synchronous frame swapping, and input synchronization.

### Function Signatures & Calling Contract

| Function Name | Wasm Signature | Triggering C Symbol | C Macro |
|---|---|---|---|
| `raylib_host_init_window` | `(width: i32, height: i32, titlePtr: i32) -> i32` | `InitPlatform()` in `src/rcore_wasi.c` | `RAYLIB_HOST_IMPORT` |
| `raylib_host_close_window` | `() -> void` | `ClosePlatform()` in `src/rcore_wasi.c` | `RAYLIB_HOST_IMPORT` |
| `raylib_host_swap_buffers` | `() -> void` | `SwapScreenBuffer()` in `src/rcore_wasi.c` | `RAYLIB_HOST_IMPORT` |
| `raylib_host_poll_input` | `(statePtr: i32) -> void` | `PollInputEvents()` in `src/rcore_wasi.c` | `RAYLIB_HOST_IMPORT` |
| `raylib_host_sleep` | `(ms: f64) -> void` | `WaitTime(double)` in `src/rcore_wasi.c` | `RAYLIB_HOST_IMPORT` |
| `raylib_host_set_title` | `(titlePtr: i32) -> void` | `SetWindowTitle()` in `src/rcore_wasi.c` | `RAYLIB_HOST_IMPORT` |
| `raylib_host_open_url` | `(urlPtr: i32) -> void` | `OpenURL()` in `src/rcore_wasi.c` | `RAYLIB_HOST_IMPORT` |

### Detailed Semantics

#### `raylib_host_init_window(width: i32, height: i32, titlePtr: i32) -> i32`
- **Purpose**: Signals the host to configure the display canvas/viewport to the dimensions `width` $\times$ `height` and decode the null-terminated UTF-8 title string at `titlePtr`.
- **Host Responsibilities**: Resizes offscreen or HTML canvas, resets input state, initializes FPS counters, and updates window title if in a browser DOM environment. Returns `0` on success.

#### `raylib_host_close_window() -> void`
- **Purpose**: Signals that the application is terminating its main loop.
- **Host Responsibilities**: Flags `shouldClose = 1` in the input state and invokes registered host cleanup hooks (`onClose`).

#### `raylib_host_swap_buffers() -> void`
- **Purpose**: Called at the end of each frame (`EndDrawing() -> SwapScreenBuffer()`).
- **Host Responsibilities**: Transfers WebGL rendering results to the display surface. In worker threads, captures `ImageBitmap` via `canvas.transferToImageBitmap()` and delivers it to the main thread via `postMessage` or executes the registered `onFrame(bitmap)` callback. Calculates instantaneous FPS and emits periodic metrics.

#### `raylib_host_poll_input(statePtr: i32) -> void`
- **Purpose**: Synchronously populates the 372-byte `WasiInputState` structure located at `statePtr` in Wasm linear memory.
- **Host Responsibilities**: Copies the latest keyboard, mouse, and queue states into Wasm memory. Empties the transient event queues (`keyPressedQueue` and `charPressedQueue`) after copying.

#### `raylib_host_sleep(ms: f64) -> void`
- **Purpose**: Suspends the Wasm thread to clamp execution to the target frame rate (`SetTargetFPS(60)`).
- **Host Responsibilities**: When executing inside a Web Worker, invokes `Atomics.wait(syncWord, 0, 0, ms)` on `syncWord` (byte offset 372 of the `SharedArrayBuffer`) to sleep precisely without CPU spinning. In environments where `Atomics` is unavailable, performs synchronous timing or yield.

---

## 3. Input Buffer Contract (`WasiInputState` & `SharedArrayBuffer`)

Input synchronization between the host and Wasm is coordinated via a contiguous 372-byte binary layout. In threaded/worker environments, this layout is hosted directly inside a 512-byte `SharedArrayBuffer`.

### Exact Memory Layout (372 Bytes)

| Offset (Bytes) | Field Name | Data Type | Size (Bytes) | Description |
|---|---|---|---|---|
| **0** | `windowWidth` | `int32` (little-endian) | 4 | Current logical window width in pixels |
| **4** | `windowHeight` | `int32` (little-endian) | 4 | Current logical window height in pixels |
| **8** | `renderWidth` | `int32` (little-endian) | 4 | Framebuffer render width in pixels |
| **12** | `renderHeight` | `int32` (little-endian) | 4 | Framebuffer render height in pixels |
| **16** | `dpiScale` | `float32` (little-endian) | 4 | Display pixel density scale ratio (e.g., `1.0`, `2.0`) |
| **20** | `shouldClose` | `int32` (little-endian) | 4 | Flag indicating window close requested (`1` = close, `0` = running) |
| **24** | `mouseX` | `float32` (little-endian) | 4 | Current mouse cursor X coordinate in window space |
| **28** | `mouseY` | `float32` (little-endian) | 4 | Current mouse cursor Y coordinate in window space |
| **32** | `mouseWheelX` | `float32` (little-endian) | 4 | Horizontal mouse wheel delta |
| **36** | `mouseWheelY` | `float32` (little-endian) | 4 | Vertical mouse wheel delta |
| **40** | `mouseButtons` | `uint32` (little-endian) | 4 | Bitfield of held mouse buttons (Bit 0: Left, Bit 1: Right, Bit 2: Middle) |
| **44..107** | `keysDown` | `uint32[16]` | 64 | 512-bit bitfield of currently pressed keys (Bit index = Raylib keycode) |
| **108** | `keyPressedQueueCount` | `int32` (little-endian) | 4 | Number of key codes queued in this frame (0 to 32) |
| **112..239** | `keyPressedQueue` | `int32[32]` | 128 | FIFO array of Raylib key codes pressed during this frame |
| **240** | `charPressedQueueCount`| `int32` (little-endian) | 4 | Number of characters queued in this frame (0 to 32) |
| **244..371** | `charPressedQueue` | `int32[32]` | 128 | FIFO array of UTF-32 codepoints input during this frame |
| **372..375** | `syncWord` | `int32` (little-endian) | 4 | Synchronization word for `Atomics.wait()` frame pacing |

### Keyboard Bitset Indexing
Each key is tracked by a bit index matching standard Raylib key definitions (e.g. `KEY_A = 65`, `KEY_SPACE = 32`, `KEY_ESCAPE = 256`, `KEY_ENTER = 257`):
$$\text{Word Index} = \lfloor \text{KeyCode} / 32 \rfloor, \quad \text{Bit Mask} = 1 \ll (\text{KeyCode} \pmod{32})$$

---

## 4. Web Audio Subsystem Host Functions (`raylib` Module)

To support the complete `<raylib.h>` audio API without multithreading or `miniaudio.h`, `src/raudio_wasi.c` decodes audio formats (WAV, MP3, OGG, FLAC, QOA) in pure C and dispatches PCM buffers to host functions.

### Direct Execution vs. Web Worker Proxying
The host implementation supports two execution modes:
1. **Direct Mode**: The host instantiates an `AudioContext` and creates Web Audio nodes directly.
2. **Worker Proxy Mode**: If running in a background Web Worker where `AudioContext` is unavailable or restricted by browser autoplay policies, host functions serialize PCM data and commands via `options.onAudioMessage(...)`. The main thread consumes these messages via `createAudioReceiver()`.

### Audio Host Import Catalog

| Function Name | Wasm Signature | Triggering C API | Semantics |
|---|---|---|---|
| `raylib_host_audio_init` | `() -> i32` | `InitAudioDevice()` | Initializes audio context and master gain node. Returns `0`. |
| `raylib_host_audio_close` | `() -> void` | `CloseAudioDevice()` | Stops all active voices/streams and terminates audio context. |
| `raylib_host_audio_is_ready` | `() -> i32` | `IsAudioDeviceReady()` | Returns `1` if the audio system is active, `0` otherwise. |
| `raylib_host_audio_set_master_volume` | `(volume: f32) -> void` | `SetMasterVolume(float)` | Sets the master gain node volume ($0.0 \dots 1.0$). |
| `raylib_host_audio_get_master_volume` | `() -> f32` | `GetMasterVolume()` | Returns current master gain volume. |
| `raylib_host_audio_create_buffer` | `(channels: i32, rate: i32, size: i32, frames: i32, dataPtr: i32) -> i32` | `LoadSound()`, `LoadSoundFromWave()` | Allocates an `AudioBuffer` and uploads PCM data. Returns integer `bufferId`. |
| `raylib_host_audio_update_buffer` | `(bufferId: i32, dataPtr: i32, frames: i32) -> void` | `UpdateSound()` | Updates existing `AudioBuffer` with fresh PCM float data. |
| `raylib_host_audio_destroy_buffer` | `(bufferId: i32) -> void` | `UnloadSound()`, `UnloadWave()` | Destroys the `AudioBuffer` handle and frees host resources. |
| `raylib_host_audio_play` | `(bufferId: i32, vol: f32, pitch: f32, pan: f32, loop: i32) -> i32` | `PlaySound()`, `PlaySound(Sound)` | Spawns a voice node (`AudioBufferSourceNode`) with pan/gain. Returns `voiceId`. |
| `raylib_host_audio_stop` | `(voiceId: i32) -> void` | `StopSound()` | Stops and disconnects the specified voice instance. |
| `raylib_host_audio_pause` | `(voiceId: i32) -> void` | `PauseSound()` | Pauses voice playback and preserves playback offset. |
| `raylib_host_audio_resume` | `(voiceId: i32) -> void` | `ResumeSound()` | Resumes voice playback from the paused offset. |
| `raylib_host_audio_is_playing` | `(voiceId: i32) -> i32` | `IsSoundPlaying()` | Returns `1` if voice is actively producing sound, `0` if finished. |
| `raylib_host_audio_set_volume` | `(voiceId: i32, vol: f32) -> void` | `SetSoundVolume()` | Adjusts voice gain node. |
| `raylib_host_audio_set_pitch` | `(voiceId: i32, pitch: f32) -> void` | `SetSoundPitch()` | Adjusts voice playback rate ($0.01 \dots$). |
| `raylib_host_audio_set_pan` | `(voiceId: i32, pan: f32) -> void` | `SetSoundPan()` | Adjusts stereo pan node (Raylib $0.0 \dots 1.0$ mapped to Web Audio $-1.0 \dots +1.0$). |
| `raylib_host_audio_stream_init` | `(channels: i32, rate: i32, size: i32) -> i32` | `LoadAudioStream()`, `LoadMusicStream()` | Initializes continuous streaming queue (`AudioStreamQueue`). Returns `streamId`. |
| `raylib_host_audio_stream_destroy` | `(streamId: i32) -> void` | `UnloadAudioStream()`, `UnloadMusicStream()` | Destroys streaming queue. |
| `raylib_host_audio_stream_feed` | `(streamId: i32, dataPtr: i32, frames: i32) -> void` | `UpdateAudioStream()`, `UpdateMusicStream()` | Schedules a chunk of decoded PCM frames into the lookahead queue. |
| `raylib_host_audio_stream_play` | `(streamId: i32) -> void` | `PlayAudioStream()`, `PlayMusicStream()` | Starts stream playback timeline. |
| `raylib_host_audio_stream_pause` | `(streamId: i32) -> void` | `PauseAudioStream()`, `PauseMusicStream()` | Pauses stream scheduling. |
| `raylib_host_audio_stream_resume` | `(streamId: i32) -> void` | `ResumeAudioStream()`, `ResumeMusicStream()` | Resumes stream scheduling. |
| `raylib_host_audio_stream_stop` | `(streamId: i32) -> void` | `StopAudioStream()`, `StopMusicStream()` | Stops stream and clears scheduled sources. |
| `raylib_host_audio_stream_is_playing`| `(streamId: i32) -> i32` | `IsAudioStreamPlaying()` | Returns `1` if stream is active, `0` otherwise. |
| `raylib_host_audio_stream_set_volume`| `(streamId: i32, vol: f32) -> void` | `SetAudioStreamVolume()` | Adjusts stream gain. |
| `raylib_host_audio_stream_set_pitch` | `(streamId: i32, pitch: f32) -> void`| `SetAudioStreamPitch()` | Adjusts stream playback rate. |
| `raylib_host_audio_stream_set_pan` | `(streamId: i32, pan: f32) -> void` | `SetAudioStreamPan()` | Adjusts stream stereo panning. |

---

## 5. OpenGL ES 2.0 State Machine Contract (`gl` Module)

All GPU rendering commands are dispatched via the `gl` module. Integer resource handles are maintained by host-side handle tables mapping `i32` identifiers to WebGL objects (`WebGLBuffer`, `WebGLTexture`, `WebGLProgram`, `WebGLShader`, `WebGLFramebuffer`, `WebGLRenderbuffer`).

### 5.1 Scalar and Direct Buffer Imports
Direct numeric and buffer functions mirror GLES2 signatures directly:

```
glViewport, glClear, glClearColor, glClearDepthf, glClearStencil, glColorMask,
glDepthMask, glDepthFunc, glDepthRangef, glCullFace, glFrontFace, glEnable, glDisable,
glBlendFunc, glBlendFuncSeparate, glBlendEquation, glBlendEquationSeparate, glBlendColor,
glLineWidth, glPolygonOffset, glScissor, glSampleCoverage, glPixelStorei, glHint,
glFlush, glFinish, glGetError, glGetIntegerv, glGetFloatv, glGetBooleanv,
glCreateBuffer, glDeleteBuffers, glGenBuffers, glBindBuffer, glBufferData, glBufferSubData,
glCreateTexture, glDeleteTextures, glGenTextures, glBindTexture, glActiveTexture,
glTexParameteri, glTexParameteri, glTexParameterfv, glTexParameteriv, glGenerateMipmap,
glTexImage2D, glTexSubImage2D, glCompressedTexImage2D, glCompressedTexSubImage2D,
glCreateShader, glDeleteShader, glCompileShader, glGetShaderiv,
glCreateProgram, glDeleteProgram, glAttachShader, glDetachShader, glLinkProgram,
glUseProgram, glValidateProgram, glGetProgramiv,
glVertexAttribPointer, glEnableVertexAttribArray, glDisableVertexAttribArray,
glVertexAttrib1f, glVertexAttrib2f, glVertexAttrib3f, glVertexAttrib4f,
glVertexAttrib1fv, glVertexAttrib2fv, glVertexAttrib3fv, glVertexAttrib4fv,
glUniform1i, glUniform2i, glUniform3i, glUniform4i,
glUniform1iv, glUniform2iv, glUniform3iv, glUniform4iv,
glUniform1f, glUniform2f, glUniform3f, glUniform4f,
glUniform1fv, glUniform2fv, glUniform3fv, glUniform4fv,
glUniformMatrix2fv, glUniformMatrix3fv, glUniformMatrix4fv,
glDrawArrays, glDrawElements,
glGenFramebuffers, glBindFramebuffer, glDeleteFramebuffers, glCheckFramebufferStatus,
glFramebufferTexture2D, glFramebufferRenderbuffer,
glGenRenderbuffers, glBindRenderbuffer, glDeleteRenderbuffers, glRenderbufferStorage
```

### 5.2 C-Wrapper Bridge Functions (`gl_host_*`)
To prevent memory leaks and eliminate complex JavaScript-side Wasm heap allocators, calls involving strings or compiler logs use dedicated bridge functions in `src/gl_wasi.c`:

| Function Name | Wasm Signature | Calling C Wrapper | Purpose |
|---|---|---|---|
| `gl_host_get_string` | `(name: i32, bufPtr: i32, maxLen: i32) -> i32` | `glGetString(GLenum)` | Copies renderer, vendor, version, or extension strings into static C buffer. Returns written length. |
| `gl_host_shader_source` | `(shader: i32, srcPtr: i32, len: i32) -> void` | `glShaderSource(...)` | Decodes concatenated UTF-8 shader source of exact length `len` into host shader. |
| `gl_host_get_shader_info_log` | `(shader: i32, maxLen: i32, lenPtr: i32, logPtr: i32) -> void` | `glGetShaderInfoLog(...)` | Retrieves shader compilation error log. |
| `gl_host_get_program_info_log`| `(program: i32, maxLen: i32, lenPtr: i32, logPtr: i32) -> void` | `glGetProgramInfoLog(...)` | Retrieves program link error log. |
| `gl_host_get_uniform_location`| `(program: i32, namePtr: i32, nameLen: i32) -> i32` | `glGetUniformLocation(...)` | Queries uniform location integer handle. Returns handle ID or `-1`. |
| `gl_host_get_attrib_location` | `(program: i32, namePtr: i32, nameLen: i32) -> i32` | `glGetAttribLocation(...)` | Queries vertex attribute integer index. Returns attribute location or `-1`. |
| `gl_host_bind_attrib_location`| `(program: i32, index: i32, namePtr: i32, nameLen: i32) -> void` | `glBindAttribLocation(...)` | Binds vertex attribute name to specific attribute slot index. |

---

## 6. WASI Preview 1 Subsystem Contract (`wasi_snapshot_preview1` / `wasi_unstable`)

`raylib-wasi` delegates WASI Preview 1 hosting to [`wasi-host`](https://github.com/breeze833/wasi-host) (`WasiHost`), or to an externally provided `options.wasiHost` / `options.wasiImports` (for example `wasm-c-ide`'s `runtime.worker.js` composing `OverlayVFS` and `stdin-wasi`). When using the built-in `WasiHost` fallback, `src/host/index.js` bridges `print`/`printErr` via line-buffered console loggers and attaches `err.exitCode = err.code` on `ProcExit`.

Standard WASI system calls required by `wasi-libc` and Raylib asset/file helpers:

| Function Name | Wasm Signature | Description & Host Behavior (`wasi-host` / External Host) |
|---|---|---|
| `proc_exit` | `(code: i32) -> void` | Invokes `onExit(code)`, unwinds execution via `ProcExit`, and attaches `exitCode` to the thrown error. |
| `fd_write` | `(fd: i32, iovs: i32, count: i32, nwritten: i32) -> i32` | Writes stdout (`fd=1`) / stderr (`fd=2`) chunks (line-buffered when using `print`/`printErr`) or writes to opened VFS files and character devices (`/dev/null`). Returns `0` (`ESUCCESS`). |
| `fd_read` | `(fd: i32, iovs: i32, count: i32, nread: i32) -> i32` | Reads from `stdin` (buffer or streaming callback, defaulting to EOF) or opened VFS files / `/dev/zero` / `/dev/null`. |
| `fd_pread` / `fd_pwrite` | `(fd: i32, iovs: i32, count: i32, offset: i64, nPtr: i32) -> i32` | Positional file reads/writes without advancing the file descriptor cursor. |
| `clock_time_get` | `(id: i32, precision: i64, timePtr: i32) -> i32` | Returns realtime or monotonic nanosecond timestamps (`performance.now()` / `Date.now()`). Returns `0`. |
| `clock_res_get` | `(id: i32, resPtr: i32) -> i32` | Writes clock resolution (`1000` ns / `1 ms` depending on clock) to memory. Returns `0`. |
| `random_get` | `(buf: i32, len: i32) -> i32` | Populates memory with cryptographically secure random bytes (`crypto.getRandomValues`). Returns `0`. |
| `environ_sizes_get` | `(countPtr: i32, bufSizePtr: i32) -> i32` | Returns environment variable count and buffer byte size. |
| `environ_get` | `(environ: i32, environBuf: i32) -> i32` | Writes `KEY=VALUE` environment strings into memory. |
| `args_sizes_get` | `(argcPtr: i32, argvBufSizePtr: i32) -> i32` | Returns CLI argument count and buffer byte size (defaults to `['raylib']`). |
| `args_get` | `(argv: i32, argvBuf: i32) -> i32` | Writes CLI argument strings into memory. |
| `fd_seek` / `fd_tell` | `(fd: i32, ...) -> i32` | Adjusts or queries current file descriptor cursor offset. |
| `fd_close` / `fd_sync` / `fd_datasync` | `(fd: i32) -> i32` | Closes descriptors and flushes tracked VFS changes (`onFileSync`). |
| `fd_fdstat_get` / `fd_fdstat_set_flags` | `(fd: i32, ...) -> i32` | Queries filetype/rights/flags (character device for stdio) and updates descriptor flags (such as `FDFLAG_APPEND`). |
| `fd_filestat_get` / `fd_filestat_set_size` / `fd_filestat_set_times` | `(fd: i32, ...) -> i32` | Queries or updates file metadata, size truncation, and timestamps. |
| `fd_prestat_get` / `fd_prestat_dir_name` | `(fd: i32, ...) -> i32` | Enumerates configured preopened directories (defaults to `fd=3` `.` -> `cwd` and `fd=4` `/`), returning `EBADF` (`8`) once past the preopen table. |
| `fd_readdir` | `(fd: i32, buf: i32, bufLen: i32, cookie: i64, usedPtr: i32) -> i32` | Lists directory entries from the mounted VFS. |
| `path_open` | `(...) -> i32` | Resolves paths relative to preopened directories, supporting read/write/create/truncate/exclusive/directory flags (`O_CREAT`, `O_TRUNC`, `O_EXCL`, `O_DIRECTORY`) against the active VFS (`OverlayVFS`, `Map`, or object). |
| `path_filestat_get` / `path_create_directory` / `path_unlink_file` / `path_remove_directory` / `path_rename` | `(...) -> i32` | VFS metadata queries, directory creation, unlinking, and renaming (invoking `onFileSync` / `onFileDelete`). |
| `poll_oneoff` | `(inPtr: i32, outPtr: i32, nsubs: i32, neventsPtr: i32) -> i32` | Handles clock subscriptions (`Atomics.wait` sleep fallback in workers). |
| `sched_yield` | `() -> i32` | Cooperative task yield. Returns `0`. |

---

## 7. Compliance & Verification Checklist for Integrators

A compliant host implementation must satisfy:
1. **Handle Consistency**: Handle IDs for buffers, textures, shaders, programs, and audio instances must be positive nonzero integers (`> 0`).
2. **Buffer Safety**: Pointer reads and writes must be validated against `memory.buffer.byteLength`.
3. **Queue Reset**: `keyPressedQueueCount` and `charPressedQueueCount` must be reset to `0` immediately after copying during `raylib_host_poll_input`.
4. **Frame Pacing**: The `Atomics.wait` synchronization word at byte offset 372 must be supported when running inside Web Workers to ensure CPU consumption is kept minimal.
5. **Clean Exit**: The host must handle `proc_exit(0)` cleanly without uncaught exception propagation.

// index.js - raylib-wasi Host Bridge entry point

import { WasiHost, ProcExit } from 'wasi-host';
import { createGLImports, createMockGL } from './gl-context.js';
import { InputCoordinator } from './input.js';
import { createAudioImports, createAudioReceiver } from './audio-context.js';

export { createGLImports, createMockGL, InputCoordinator, createAudioImports, createAudioReceiver };

const HAS_SAB = typeof SharedArrayBuffer !== 'undefined';

function createLineBufferedLogger(printFn) {
  let buffer = '';
  return (text) => {
    buffer += text;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      printFn(line);
    }
  };
}

function wrapProcExit(wasiImports, onExit) {
  if (!wasiImports || typeof wasiImports.proc_exit !== 'function') {
    return wasiImports;
  }
  const origProcExit = wasiImports.proc_exit;
  return new Proxy(wasiImports, {
    get(target, prop) {
      if (prop === 'proc_exit') {
        return (code) => {
          if (typeof onExit === 'function') onExit(code);
          try {
            origProcExit(code);
          } catch (err) {
            if (err && typeof err === 'object' && err.exitCode === undefined) {
              err.exitCode = err.code !== undefined ? err.code : code;
            }
            throw err;
          }
          const exitErr = new ProcExit(code);
          exitErr.exitCode = code;
          throw exitErr;
        };
      }
      return target[prop];
    },
  });
}

/**
 * Creates a thin WASI Preview 1 compatibility import object backed by WasiHost.
 * Prefer passing `wasiHost` directly to `createRaylibHost` or using `WasiHost` from `wasi-host`.
 */
export function createWasiImports(getMemory, options = {}) {
  const printStdout = options.print || ((text) => console.log(text));
  const printStderr = options.printErr || ((text) => console.error(text));

  const host = new WasiHost({
    vfs: options.vfs,
    cwd: options.cwd || '/',
    argv: options.argv || ['raylib'],
    environ: options.environ,
    preopens: options.preopens,
    stdin: options.stdin,
    stdout: options.stdout || createLineBufferedLogger(printStdout),
    stderr: options.stderr || createLineBufferedLogger(printStderr),
    getMemory,
    onFileSync: options.onFileSync,
    onFileDelete: options.onFileDelete,
  });

  return wrapProcExit(host.getImports(), options.onExit);
}

export function createRaylibHost(options = {}) {
  let memory = null;
  const getMemory = () => {
    if (!memory) throw new Error('WebAssembly memory not bound. Call host.setMemory(instance.exports.memory) or host.setInstance(instance)');
    return memory;
  };

  const utf8Decoder = new TextDecoder('utf-8');
  function decodeString(ptr) {
    if (ptr === 0) return '';
    const mem = getMemory();
    const u8 = new Uint8Array(mem.buffer, ptr);
    let end = 0;
    while (u8[end] !== 0) end++;
    const slice = u8.subarray(0, end);
    if (HAS_SAB && mem.buffer instanceof SharedArrayBuffer) {
      const unshared = new Uint8Array(end);
      unshared.set(slice);
      return utf8Decoder.decode(unshared);
    }
    return utf8Decoder.decode(slice);
  }

  // Initialize Canvas & WebGL Context
  let canvas = options.canvas || null;
  let gl = options.gl || null;
  if (!gl) {
    if (!canvas && typeof OffscreenCanvas !== 'undefined') {
      const w = options.width || 800;
      const h = options.height || 450;
      canvas = new OffscreenCanvas(w, h);
    }
    if (canvas && typeof canvas.getContext === 'function') {
      gl = canvas.getContext('webgl', {
        alpha: false,
        depth: true,
        stencil: true,
        antialias: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false
      });
    }
  }

  // Create sub-modules
  const input = options.inputCoordinator || options.input || new InputCoordinator({
    canvas,
    sharedBuffer: options.sharedBuffer || null,
    width: options.width || (canvas ? canvas.width : 800),
    height: options.height || (canvas ? canvas.height : 450),
    dpiScale: options.dpiScale || (typeof window !== 'undefined' ? window.devicePixelRatio : 1.0)
  });

  const glImports = gl ? createGLImports(gl, getMemory) : {};

  let wasiHost = options.wasiHost || null;
  let wasiImports = null;
  if (wasiHost) {
    if (typeof wasiHost.setMemory === 'function') {
      wasiHost.setMemory(getMemory);
    }
    wasiImports = typeof wasiHost.getImports === 'function'
      ? wasiHost.getImports()
      : wasiHost.createImportObject().wasi_snapshot_preview1;
  } else if (options.wasiImports) {
    wasiImports = options.wasiImports;
  } else {
    const printStdout = options.print || ((text) => console.log(text));
    const printStderr = options.printErr || ((text) => console.error(text));
    wasiHost = new WasiHost({
      vfs: options.vfs,
      cwd: options.cwd || '/',
      argv: options.argv || ['raylib'],
      environ: options.environ,
      preopens: options.preopens,
      stdin: options.stdin,
      stdout: options.stdout || createLineBufferedLogger(printStdout),
      stderr: options.stderr || createLineBufferedLogger(printStderr),
      getMemory,
      onFileSync: options.onFileSync,
      onFileDelete: options.onFileDelete,
    });
    wasiImports = wrapProcExit(wasiHost.getImports(), options.onExit);
  }

  const audioImports = createAudioImports(getMemory, options);

  let lastFpsTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let frameCount = 0;

  const raylibImports = {
    raylib_host_init_window: (width, height, titlePtr) => {
      const title = decodeString(titlePtr);
      if (canvas) {
        canvas.width = width;
        canvas.height = height;
      }
      input.windowWidth = width;
      input.windowHeight = height;
      input.renderWidth = width;
      input.renderHeight = height;
      input.shouldClose = false;
      input.updateSharedState();
      lastFpsTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      frameCount = 0;
      if (typeof document !== 'undefined' && title) {
        document.title = title;
      }
      if (options.onInitWindow) {
        options.onInitWindow(width, height, title);
      }
      return 0;
    },

    raylib_host_close_window: () => {
      input.shouldClose = true;
      input.updateSharedState();
      if (options.onClose) options.onClose();
    },

    raylib_host_swap_buffers: () => {
      let bitmap = null;
      if (canvas && typeof canvas.transferToImageBitmap === 'function') {
        try {
          bitmap = canvas.transferToImageBitmap();
        } catch (_) {
          // Ignore if placeholder canvas or detached
        }
      }

      if (options.onFrame) {
        options.onFrame(bitmap);
      } else if (bitmap && typeof self !== 'undefined' && typeof self.postMessage === 'function') {
        self.postMessage({ type: 'frame', bitmap }, [bitmap]);
      }

      // Track and emit FPS
      frameCount++;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - lastFpsTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
        if (options.onFPS) {
          options.onFPS(fps);
        } else if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
          self.postMessage({ type: 'fps', fps });
        }
        frameCount = 0;
        lastFpsTime = now;
      }

      // Legacy OffscreenCanvas commit if available
      if (gl && gl.commit) gl.commit();
    },

    raylib_host_poll_input: (statePtr) => {
      input.pollToWasm(statePtr, getMemory());
    },

    raylib_host_sleep: (ms) => {
      if (ms <= 0) return;
      if (input.syncWord) {
        // Synchronous frame delay via Atomics.wait on SharedArrayBuffer in Web Worker
        Atomics.wait(input.syncWord, 0, 0, Math.max(1, Math.round(ms)));
      } else if (typeof Atomics !== 'undefined' && options.sharedBuffer) {
        const sync = new Int32Array(options.sharedBuffer, 372, 1);
        Atomics.wait(sync, 0, 0, Math.max(1, Math.round(ms)));
      }
    },

    raylib_host_set_title: (titlePtr) => {
      const title = decodeString(titlePtr);
      if (typeof document !== 'undefined' && title) {
        document.title = title;
      }
    },

    raylib_host_open_url: (urlPtr) => {
      const url = decodeString(urlPtr);
      if (typeof window !== 'undefined' && url) {
        window.open(url, '_blank');
      }
    }
  };

  const combinedRaylibImports = Object.assign({}, raylibImports, audioImports);

  const host = {
    input,
    gl,
    wasiHost,
    audio: audioImports,
    getImports: () => ({
      gl: glImports,
      raylib: combinedRaylibImports,
      audio: audioImports,
      wasi_snapshot_preview1: wasiImports,
      wasi_unstable: wasiImports,
    }),
    setMemory: (mem) => {
      memory = mem;
      if (wasiHost && typeof wasiHost.setMemory === 'function') {
        wasiHost.setMemory(getMemory);
      }
    },
    setInstance: (inst) => {
      memory = inst.exports.memory;
      if (wasiHost && typeof wasiHost.setMemory === 'function') {
        wasiHost.setMemory(getMemory);
      }
    },
    run: async (wasmBinary) => {
      const imports = host.getImports();
      const { instance } = await WebAssembly.instantiate(wasmBinary, imports);
      host.setInstance(instance);
      try {
        if (instance.exports._start) {
          instance.exports._start();
        } else if (instance.exports.main) {
          instance.exports.main();
        }
      } catch (err) {
        if (err instanceof ProcExit || (err && typeof err.code === 'number')) {
          err.exitCode = err.code;
        }
        throw err;
      }
      return instance;
    }
  };

  return host;
}

export class RaylibReferenceHost {
  constructor(options = {}) {
    this.options = Object.assign({}, options);
    this.stats = {
      framesRendered: 0,
      drawCalls: 0,
      audioBuffersCreated: 0,
      audioVoicesPlayed: 0,
      audioStreamsInitialized: 0,
      audioStreamChunksFed: 0
    };

    this.stdoutLines = [];
    this.stderrLines = [];
    this.exitCode = null;

    this.glStats = {};
    this.gl = this.options.gl || createMockGL(this.glStats);

    this.audioMessages = [];
    const userAudioMsgHandler = this.options.onAudioMessage;
    const trackingAudioMsgHandler = (msg, transfer) => {
      this.audioMessages.push(msg);
      if (msg.type === 'audio_create_buffer') this.stats.audioBuffersCreated++;
      if (msg.type === 'audio_play') this.stats.audioVoicesPlayed++;
      if (msg.type === 'audio_stream_init') this.stats.audioStreamsInitialized++;
      if (msg.type === 'audio_stream_feed') this.stats.audioStreamChunksFed++;
      if (userAudioMsgHandler) userAudioMsgHandler(msg, transfer);
    };

    this.host = createRaylibHost({
      gl: this.gl,
      width: this.options.width || 800,
      height: this.options.height || 450,
      sharedBuffer: this.options.sharedBuffer || null,
      onAudioMessage: trackingAudioMsgHandler,
      print: (text) => {
        this.stdoutLines.push(text);
        if (this.options.print) this.options.print(text);
      },
      printErr: (text) => {
        this.stderrLines.push(text);
        if (this.options.printErr) this.options.printErr(text);
      },
      onExit: (code) => {
        this.exitCode = code;
        if (this.options.onExit) this.options.onExit(code);
      },
      onFrame: (bitmap) => {
        this.stats.framesRendered++;
        this.stats.drawCalls = (this.glStats.drawArraysCount || 0) + (this.glStats.drawElementsCount || 0);

        if (this.options.onFrame) {
          this.options.onFrame(this.stats.framesRendered, this);
        }

        if (this.options.maxFrames && this.stats.framesRendered >= this.options.maxFrames) {
          this.requestClose();
        }
      }
    });

    this.input = this.host.input;
  }

  pressKey(keyCode) {
    if (keyCode >= 0 && keyCode < 512) {
      const word = Math.floor(keyCode / 32);
      const bit = keyCode % 32;
      this.input.keysDown[word] |= (1 << bit);
      this.input.keyPressedQueue.push(keyCode);
      this.input.updateSharedState();
    }
  }

  releaseKey(keyCode) {
    if (keyCode >= 0 && keyCode < 512) {
      const word = Math.floor(keyCode / 32);
      const bit = keyCode % 32;
      this.input.keysDown[word] &= ~(1 << bit);
      this.input.updateSharedState();
    }
  }

  setMousePosition(x, y) {
    this.input.mouseX = x;
    this.input.mouseY = y;
    this.input.updateSharedState();
  }

  pressMouseButton(button = 0) {
    this.input.mouseButtons |= (1 << button);
    this.input.updateSharedState();
  }

  releaseMouseButton(button = 0) {
    this.input.mouseButtons &= ~(1 << button);
    this.input.updateSharedState();
  }

  requestClose() {
    this.input.shouldClose = true;
    this.input.updateSharedState();
  }

  async run(wasmBinary, runtimeOptions = {}) {
    if (typeof wasmBinary === 'string') {
      const { readFileSync } = await import('node:fs');
      wasmBinary = readFileSync(wasmBinary);
    }
    if (runtimeOptions.maxFrames) {
      this.options.maxFrames = runtimeOptions.maxFrames;
    }

    try {
      await this.host.run(wasmBinary);
      if (this.exitCode === null) {
        this.exitCode = 0;
      }
    } catch (err) {
      if (typeof err.exitCode === 'number') {
        this.exitCode = err.exitCode;
      } else {
        throw err;
      }
    }

    return {
      exitCode: this.exitCode,
      framesRendered: this.stats.framesRendered,
      drawCalls: this.stats.drawCalls,
      clearCount: this.glStats.clearCount || 0,
      stdoutLines: this.stdoutLines,
      stderrLines: this.stderrLines,
      audioMessages: this.audioMessages
    };
  }
}

export default createRaylibHost;

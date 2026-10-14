// index.js - raylib-wasi Host Bridge entry point

import { createGLImports } from './gl-context.js';
import { InputCoordinator } from './input.js';
import { createWasiImports } from './wasi.js';

export { createGLImports, InputCoordinator, createWasiImports };

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
    return utf8Decoder.decode(new Uint8Array(mem.buffer, ptr, end));
  }

  // Initialize Canvas & WebGL Context
  let canvas = options.canvas || null;
  let gl = options.gl || null;
  if (!gl && canvas) {
    gl = canvas.getContext('webgl', {
      alpha: false,
      depth: true,
      stencil: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false
    });
  }

  // Create sub-modules
  const input = new InputCoordinator({
    canvas,
    sharedBuffer: options.sharedBuffer || null,
    width: options.width || (canvas ? canvas.width : 800),
    height: options.height || (canvas ? canvas.height : 450),
    dpiScale: options.dpiScale || (typeof window !== 'undefined' ? window.devicePixelRatio : 1.0)
  });

  const glImports = gl ? createGLImports(gl, getMemory) : {};
  const wasiImports = createWasiImports(getMemory, options);

  const raylibImports = {
    raylib_host_init_window: (width, height, titlePtr) => {
      const title = decodeString(titlePtr);
      if (canvas) {
        if (!canvas.width) canvas.width = width;
        if (!canvas.height) canvas.height = height;
      }
      input.windowWidth = width;
      input.windowHeight = height;
      input.renderWidth = width;
      input.renderHeight = height;
      input.updateSharedState();
      if (typeof document !== 'undefined' && title) {
        document.title = title;
      }
      return 0;
    },

    raylib_host_close_window: () => {
      input.shouldClose = true;
      input.updateSharedState();
      if (options.onClose) options.onClose();
    },

    raylib_host_swap_buffers: () => {
      if (options.onFrame) options.onFrame();
      // OffscreenCanvas in worker commit if available
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

  const host = {
    input,
    gl,
    getImports: () => ({
      gl: glImports,
      raylib: raylibImports,
      wasi_snapshot_preview1: wasiImports
    }),
    setMemory: (mem) => { memory = mem; },
    setInstance: (inst) => {
      memory = inst.exports.memory;
    },
    run: async (wasmBinary) => {
      const imports = host.getImports();
      const { instance } = await WebAssembly.instantiate(wasmBinary, imports);
      host.setInstance(instance);
      if (instance.exports._start) {
        instance.exports._start();
      } else if (instance.exports.main) {
        instance.exports.main();
      }
      return instance;
    }
  };

  return host;
}

export default createRaylibHost;

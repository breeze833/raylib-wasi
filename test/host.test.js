// host.test.js - Unit tests for raylib-host.js
import assert from 'node:assert';
import { test } from 'node:test';
import { createRaylibHost, createGLImports, InputCoordinator, createWasiImports } from '../dist/raylib-host.js';

test('Host Bridge exports validation', () => {
  assert.strictEqual(typeof createRaylibHost, 'function');
  assert.strictEqual(typeof createGLImports, 'function');
  assert.strictEqual(typeof InputCoordinator, 'function');
  assert.strictEqual(typeof createWasiImports, 'function');
});

test('WebGL Context handle tables and mock dispatch', () => {
  const calls = [];
  const mockGL = {
    createBuffer: () => ({ type: 'WebGLBuffer' }),
    deleteBuffer: (b) => calls.push(['deleteBuffer', b]),
    bindBuffer: (t, b) => calls.push(['bindBuffer', t, b]),
    bufferData: (t, d, u) => calls.push(['bufferData', t, d, u]),
    bufferSubData: (t, o, d) => calls.push(['bufferSubData', t, o, d]),
    createTexture: () => ({ type: 'WebGLTexture' }),
    deleteTexture: (t) => calls.push(['deleteTexture', t]),
    bindTexture: (t, tex) => calls.push(['bindTexture', t, tex]),
    texImage2D: (...args) => calls.push(['texImage2D', ...args]),
    createShader: (type) => ({ type: 'WebGLShader', shaderType: type }),
    deleteShader: (s) => calls.push(['deleteShader', s]),
    compileShader: (s) => calls.push(['compileShader', s]),
    shaderSource: (s, src) => calls.push(['shaderSource', s, src]),
    getShaderParameter: (s, pname) => 1,
    getShaderInfoLog: (s) => '',
    createProgram: () => ({ type: 'WebGLProgram' }),
    deleteProgram: (p) => calls.push(['deleteProgram', p]),
    attachShader: (p, s) => calls.push(['attachShader', p, s]),
    linkProgram: (p) => calls.push(['linkProgram', p]),
    getProgramParameter: (p, pname) => 1,
    getProgramInfoLog: (p) => '',
    useProgram: (p) => calls.push(['useProgram', p]),
    getUniformLocation: (p, name) => ({ name }),
    uniform1i: (loc, val) => calls.push(['uniform1i', loc, val]),
    viewport: (x, y, w, h) => calls.push(['viewport', x, y, w, h]),
    clearColor: (r, g, b, a) => calls.push(['clearColor', r, g, b, a]),
    clear: (mask) => calls.push(['clear', mask]),
    getParameter: (pname) => {
      if (pname === 0x0D33) return 4096; // GL_MAX_TEXTURE_SIZE
      return 0;
    }
  };

  const wasmMem = new WebAssembly.Memory({ initial: 1 });
  const glImports = createGLImports(mockGL, () => wasmMem);

  // Buffer test
  glImports.glGenBuffers(2, 100);
  const u32 = new Uint32Array(wasmMem.buffer, 100, 2);
  const bufId1 = u32[0];
  const bufId2 = u32[1];
  assert.strictEqual(bufId1, 1);
  assert.strictEqual(bufId2, 2);

  glImports.glBindBuffer(0x8892, bufId1);
  assert.deepStrictEqual(calls[calls.length - 1], ['bindBuffer', 0x8892, { type: 'WebGLBuffer' }]);

  // Test buffer data
  new Uint8Array(wasmMem.buffer, 200, 4).set([1, 2, 3, 4]);
  glImports.glBufferData(0x8892, 4, 200, 0x88E4);
  assert.strictEqual(calls[calls.length - 1][0], 'bufferData');

  // Test delete buffers
  glImports.glDeleteBuffers(1, 100);
  assert.deepStrictEqual(calls[calls.length - 1], ['deleteBuffer', { type: 'WebGLBuffer' }]);

  // Test shader and program
  const shaderId = glImports.glCreateShader(0x8B31);
  assert.strictEqual(shaderId, 1);

  // Write shader string to memory: "void main(){}"
  const encoder = new TextEncoder();
  const srcBytes = encoder.encode("void main(){}");
  new Uint8Array(wasmMem.buffer, 300, srcBytes.length).set(srcBytes);
  glImports.gl_host_shader_source(shaderId, 300, srcBytes.length);
  assert.deepStrictEqual(calls[calls.length - 1], ['shaderSource', { type: 'WebGLShader', shaderType: 0x8B31 }, "void main(){}"]);

  glImports.glCompileShader(shaderId);
  glImports.glGetShaderiv(shaderId, 0x8B81, 400); // GL_COMPILE_STATUS
  assert.strictEqual(new Int32Array(wasmMem.buffer, 400, 1)[0], 1);

  const progId = glImports.glCreateProgram();
  assert.strictEqual(progId, 1);
  glImports.glAttachShader(progId, shaderId);
  glImports.glLinkProgram(progId);
  glImports.glUseProgram(progId);

  // Test uniform location mapping
  const uniformName = encoder.encode("uMatrix\0");
  new Uint8Array(wasmMem.buffer, 500, uniformName.length).set(uniformName);
  const uLocId = glImports.gl_host_get_uniform_location(progId, 500, 7);
  assert.strictEqual(uLocId, 1);

  glImports.glUniform1i(uLocId, 42);
  assert.deepStrictEqual(calls[calls.length - 1], ['uniform1i', { name: 'uMatrix' }, 42]);

  // Test string query
  glImports.gl_host_get_string(0x1F02, 600, 128); // GL_VERSION
  const versionStr = new TextDecoder().decode(new Uint8Array(wasmMem.buffer, 600, 64)).replace(/\0.*$/, '');
  assert.strictEqual(versionStr, 'OpenGL ES 2.0 (WebGL 1.0)');

  // Test queries
  glImports.glGetIntegerv(0x0D33, 700);
  assert.strictEqual(new Int32Array(wasmMem.buffer, 700, 1)[0], 4096);
});

test('InputCoordinator memory layout and SharedArrayBuffer synchronization', () => {
  const sab = new SharedArrayBuffer(512);
  const input = new InputCoordinator({ sharedBuffer: sab, width: 1024, height: 768 });

  // Simulate key down: 'Space' -> key 32
  input.keysDown[1] |= (1 << 0); // word 1, bit 0 = key 32
  input.keyPressedQueue.push(32);
  input.mouseX = 250.5;
  input.mouseY = 180.25;
  input.mouseButtons = 1; // Left button
  input.updateSharedState();

  const wasmMem = new WebAssembly.Memory({ initial: 1 });
  input.pollToWasm(1000, wasmMem);

  const view = new DataView(wasmMem.buffer, 1000, 372);
  assert.strictEqual(view.getInt32(0, true), 1024); // windowWidth
  assert.strictEqual(view.getInt32(4, true), 768);  // windowHeight
  assert.strictEqual(view.getInt32(20, true), 0);   // shouldClose = 0
  assert.strictEqual(view.getFloat32(24, true), 250.5); // mouseX
  assert.strictEqual(view.getFloat32(28, true), 180.25); // mouseY
  assert.strictEqual(view.getUint32(40, true), 1);  // mouseButtons = 1

  // Keys down: word 1 must have bit 0 set (1)
  assert.strictEqual(view.getUint32(44 + 4, true), 1);

  // Key pressed queue
  assert.strictEqual(view.getInt32(108, true), 1);
  assert.strictEqual(view.getInt32(112, true), 32);
});

test('createRaylibHost and WASI snapshot preview1', () => {
  const logs = [];
  const host = createRaylibHost({
    print: (msg) => logs.push(msg)
  });

  const wasmMem = new WebAssembly.Memory({ initial: 1 });
  host.setMemory(wasmMem);

  const imports = host.getImports();
  assert.ok(imports.gl);
  assert.ok(imports.raylib);
  assert.ok(imports.wasi_snapshot_preview1);

  // Test fd_write stdout
  const encoder = new TextEncoder();
  const helloBytes = encoder.encode("Hello from WASI Raylib!\n");
  new Uint8Array(wasmMem.buffer, 100, helloBytes.length).set(helloBytes);

  // Setup iovec at 200: [ptr=100, len=helloBytes.length]
  const view = new DataView(wasmMem.buffer);
  view.setUint32(200, 100, true);
  view.setUint32(204, helloBytes.length, true);

  imports.wasi_snapshot_preview1.fd_write(1, 200, 1, 300);
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0], "Hello from WASI Raylib!");

  // Test proc_exit
  let exitedCode = -1;
  try {
    imports.wasi_snapshot_preview1.proc_exit(0);
  } catch (e) {
    exitedCode = e.exitCode;
  }
  assert.strictEqual(exitedCode, 0);
});

test('raylib_host_swap_buffers captures ImageBitmap from OffscreenCanvas and dispatches onFrame', () => {
  const fakeBitmap = { width: 800, height: 450, close: () => {} };
  let bitmapTransferred = false;
  const mockCanvas = {
    width: 800,
    height: 450,
    transferToImageBitmap: () => {
      bitmapTransferred = true;
      return fakeBitmap;
    }
  };

  let frameReceived = null;
  const host = createRaylibHost({
    canvas: mockCanvas,
    onFrame: (bitmap) => {
      frameReceived = bitmap;
    }
  });

  const imports = host.getImports();
  imports.raylib.raylib_host_swap_buffers();

  assert.strictEqual(bitmapTransferred, true);
  assert.strictEqual(frameReceived, fakeBitmap);
});

test('dist/headers.js exports Raylib header string constants', async () => {
  const { RAYLIB_H, RAYMATH_H, RLGL_H } = await import('../dist/headers.js');
  assert.strictEqual(typeof RAYLIB_H, 'string');
  assert.strictEqual(typeof RAYMATH_H, 'string');
  assert.strictEqual(typeof RLGL_H, 'string');
  assert.strictEqual(RAYLIB_H.includes('InitWindow'), true);
  assert.strictEqual(RAYMATH_H.includes('Vector2'), true);
  assert.strictEqual(RLGL_H.includes('rlgl'), true);
});

test('createRaylibHost supports input injection, dynamic resize, and onFPS callback', () => {
  let initedTitle = '';
  let initedW = 0;
  let initedH = 0;
  let reportedFps = 0;

  const mockCanvas = { width: 100, height: 100, transferToImageBitmap: () => ({}) };
  const customInput = new InputCoordinator({ width: 100, height: 100 });

  const host = createRaylibHost({
    canvas: mockCanvas,
    inputCoordinator: customInput,
    onInitWindow: (w, h, title) => {
      initedW = w;
      initedH = h;
      initedTitle = title;
    },
    onFPS: (fps) => {
      reportedFps = fps;
    }
  });

  assert.strictEqual(host.input, customInput);

  const wasmMem = new WebAssembly.Memory({ initial: 1 });
  host.setMemory(wasmMem);

  // Write "Test Title" into memory
  const str = 'Test Title\0';
  const u8 = new Uint8Array(wasmMem.buffer, 1024, str.length);
  for (let i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i);

  host.getImports().raylib.raylib_host_init_window(640, 480, 1024);
  assert.strictEqual(mockCanvas.width, 640);
  assert.strictEqual(mockCanvas.height, 480);
  assert.strictEqual(initedW, 640);
  assert.strictEqual(initedH, 480);
  assert.strictEqual(initedTitle, 'Test Title');
  assert.strictEqual(customInput.shouldClose, false);
});

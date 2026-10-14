// symbols.test.js - Automated symbol verification and Wasm import validation
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const libPath = path.join(rootDir, 'dist', 'lib', 'libraylib.a');

test('libraylib.a exports all standard Raylib symbols', () => {
  assert.ok(fs.existsSync(libPath), 'dist/lib/libraylib.a must exist');

  const nmOutput = execSync(`llvm-nm --defined-only "${libPath}"`, { encoding: 'utf-8' });
  const requiredSymbols = [
    'InitWindow',
    'CloseWindow',
    'WindowShouldClose',
    'BeginDrawing',
    'EndDrawing',
    'ClearBackground',
    'DrawText',
    'DrawRectangle',
    'DrawCircle',
    'DrawLine',
    'DrawTriangle',
    'DrawPoly',
    'IsKeyDown',
    'IsKeyPressed',
    'GetMousePosition',
    'IsMouseButtonDown',
    'SetTargetFPS',
    'GetFPS',
    'GetFrameTime',
    'GetTime',
    'WaitTime',
    'rlglInit',
    'rlglClose'
  ];

  for (const sym of requiredSymbols) {
    const regex = new RegExp(`\\b(T|D)\\s+${sym}\\b`);
    assert.ok(regex.test(nmOutput), `Symbol ${sym} must be defined in libraylib.a`);
  }
});

test('Example wasm binaries import only allowed namespaces', () => {
  const examples = [
    'core_basic_window.wasm',
    'shapes_basic_shapes.wasm',
    'core_input_keys.wasm'
  ];

  const allowedModules = new Set(['gl', 'raylib', 'wasi_snapshot_preview1']);

  for (const ex of examples) {
    const wasmPath = path.join(rootDir, 'examples', ex);
    assert.ok(fs.existsSync(wasmPath), `Example ${ex} must exist`);

    const wasmBuffer = fs.readFileSync(wasmPath);
    const wasmModule = new WebAssembly.Module(wasmBuffer);
    const imports = WebAssembly.Module.imports(wasmModule);

    assert.ok(imports.length > 0, `Example ${ex} must have imports`);
    for (const imp of imports) {
      assert.ok(
        allowedModules.has(imp.module),
        `Unexpected import module "${imp.module}" in ${ex} (symbol: ${imp.name})`
      );
    }
  }
});

test('All example wasm binaries run and exit cleanly via raylib-host.js', async () => {
  const { createRaylibHost } = await import('../dist/raylib-host.js');

  const mockGL = {
    viewport: () => {}, clear: () => {}, clearColor: () => {}, clearDepth: () => {},
    clearStencil: () => {}, colorMask: () => {}, depthMask: () => {}, depthFunc: () => {},
    depthRange: () => {}, cullFace: () => {}, frontFace: () => {}, enable: () => {},
    disable: () => {}, blendFunc: () => {}, blendFuncSeparate: () => {}, blendEquation: () => {},
    blendEquationSeparate: () => {}, blendColor: () => {}, lineWidth: () => {},
    polygonOffset: () => {}, scissor: () => {}, sampleCoverage: () => {}, hint: () => {},
    pixelStorei: () => {}, flush: () => {}, finish: () => {}, getError: () => 0,
    createBuffer: () => ({}), deleteBuffer: () => {}, bindBuffer: () => {},
    bufferData: () => {}, bufferSubData: () => {}, createTexture: () => ({}),
    deleteTexture: () => {}, bindTexture: () => {}, activeTexture: () => {},
    texParameteri: () => {}, texParameterf: () => {}, generateMipmap: () => {},
    texImage2D: () => {}, texSubImage2D: () => {}, createShader: (type) => ({ type }),
    deleteShader: () => {}, compileShader: () => {}, shaderSource: () => {},
    getShaderParameter: () => 1, getShaderInfoLog: () => '', createProgram: () => ({}),
    deleteProgram: () => {}, attachShader: () => {}, detachShader: () => {},
    linkProgram: () => {}, useProgram: () => {}, validateProgram: () => {},
    bindAttribLocation: () => {}, getAttribLocation: () => 0, getProgramParameter: () => 1,
    getProgramInfoLog: () => '', vertexAttribPointer: () => {}, enableVertexAttribArray: () => {},
    disableVertexAttribArray: () => {}, vertexAttrib1f: () => {}, vertexAttrib2f: () => {},
    vertexAttrib3f: () => {}, vertexAttrib4f: () => {}, getUniformLocation: (p, n) => ({ n }),
    uniform1i: () => {}, uniform1f: () => {}, uniform4f: () => {}, uniformMatrix4fv: () => {},
    drawArrays: () => {}, drawElements: () => {}, getParameter: () => 2048
  };

  const examples = [
    'core_basic_window.wasm',
    'shapes_basic_shapes.wasm',
    'core_input_keys.wasm'
  ];

  for (const ex of examples) {
    const wasmPath = path.join(rootDir, 'examples', ex);
    const wasmBuffer = fs.readFileSync(wasmPath);

    let frameCount = 0;
    const host = createRaylibHost({
      gl: mockGL,
      width: 800,
      height: 450,
      print: () => {},
      onFrame: () => {
        frameCount++;
        if (frameCount >= 3) {
          host.input.shouldClose = true;
        }
      }
    });

    try {
      await host.run(wasmBuffer);
      assert.ok(frameCount >= 3, `Example ${ex} drew at least 3 frames`);
    } catch (err) {
      if (err.exitCode === 0) {
        assert.ok(frameCount >= 3, `Example ${ex} exited cleanly with code 0`);
      } else {
        throw err;
      }
    }
  }
});

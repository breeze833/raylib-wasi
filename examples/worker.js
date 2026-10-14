// worker.js - Web Worker runtime harness using raylib-host.js and SharedArrayBuffer
import { createRaylibHost } from '../dist/raylib-host.js';

self.onmessage = async (e) => {
  const { wasmUrl, canvas, sharedBuffer, width, height } = e.data;

  const gl = canvas.getContext('webgl', {
    alpha: false,
    depth: true,
    stencil: true,
    antialias: true,
    premultipliedAlpha: false
  });

  let fps = 0;
  let lastTime = performance.now();
  let frames = 0;

  const host = createRaylibHost({
    canvas,
    gl,
    sharedBuffer,
    width,
    height,
    print: (text) => self.postMessage({ type: 'log', text }),
    printErr: (text) => self.postMessage({ type: 'err', text }),
    onFrame: () => {
      frames++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        fps = frames;
        frames = 0;
        lastTime = now;
        self.postMessage({ type: 'fps', fps });
      }
    },
    onClose: () => {
      self.postMessage({ type: 'status', status: 'closed' });
    }
  });

  try {
    const res = await fetch(wasmUrl);
    const wasmBinary = await res.arrayBuffer();
    self.postMessage({ type: 'status', status: 'running' });
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

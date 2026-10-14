// wasi.js - Standard WASI Snapshot Preview 1 implementation for browser & node

export function createWasiImports(getMemory, options = {}) {
  const utf8Decoder = new TextDecoder('utf-8');
  let stdoutBuffer = '';
  let stderrBuffer = '';

  const printStdout = options.print || ((text) => console.log(text));
  const printStderr = options.printErr || ((text) => console.error(text));

  return {
    proc_exit: (code) => {
      if (options.onExit) options.onExit(code);
      const err = new Error(`WASI program exited with code ${code}`);
      err.exitCode = code;
      throw err;
    },

    environ_sizes_get: (countPtr, bufSizePtr) => {
      const mem = getMemory();
      new Uint32Array(mem.buffer, countPtr, 1)[0] = 0;
      new Uint32Array(mem.buffer, bufSizePtr, 1)[0] = 0;
      return 0; // Success
    },

    environ_get: (environ, environBuf) => 0,

    args_sizes_get: (argcPtr, argvBufSizePtr) => {
      const mem = getMemory();
      new Uint32Array(mem.buffer, argcPtr, 1)[0] = 0;
      new Uint32Array(mem.buffer, argvBufSizePtr, 1)[0] = 0;
      return 0;
    },

    args_get: (argv, argvBuf) => 0,

    clock_time_get: (id, precision, timePtr) => {
      const mem = getMemory();
      const nowMs = (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
      const nowNs = BigInt(Math.floor(nowMs * 1e6));
      new BigUint64Array(mem.buffer, timePtr, 1)[0] = nowNs;
      return 0;
    },

    clock_res_get: (id, resPtr) => {
      const mem = getMemory();
      new BigUint64Array(mem.buffer, resPtr, 1)[0] = 1000n; // 1 microsecond resolution
      return 0;
    },

    fd_write: (fd, iovs, iovs_len, nwrittenPtr) => {
      const mem = getMemory();
      const view = new DataView(mem.buffer);
      let totalWritten = 0;

      for (let i = 0; i < iovs_len; i++) {
        const ptr = view.getUint32(iovs + i * 8, true);
        const len = view.getUint32(iovs + i * 8 + 4, true);
        const chunk = new Uint8Array(mem.buffer, ptr, len);
        const str = utf8Decoder.decode(chunk);

        if (fd === 1) { // stdout
          stdoutBuffer += str;
          const lines = stdoutBuffer.split('\n');
          stdoutBuffer = lines.pop();
          for (const line of lines) printStdout(line);
        } else if (fd === 2) { // stderr
          stderrBuffer += str;
          const lines = stderrBuffer.split('\n');
          stderrBuffer = lines.pop();
          for (const line of lines) printStderr(line);
        }
        totalWritten += len;
      }

      if (nwrittenPtr !== 0) {
        view.setUint32(nwrittenPtr, totalWritten, true);
      }
      return 0;
    },

    fd_read: (fd, iovs, iovs_len, nreadPtr) => {
      if (nreadPtr !== 0) {
        const mem = getMemory();
        new Uint32Array(mem.buffer, nreadPtr, 1)[0] = 0;
      }
      return 0;
    },

    fd_seek: (fd, offset, whence, newOffsetPtr) => {
      if (newOffsetPtr !== 0) {
        const mem = getMemory();
        new BigUint64Array(mem.buffer, newOffsetPtr, 1)[0] = 0n;
      }
      return 0;
    },

    fd_close: (fd) => 0,
    fd_sync: (fd) => 0,

    fd_fdstat_get: (fd, statPtr) => {
      const mem = getMemory();
      const view = new DataView(mem.buffer, statPtr, 24);
      // fs_filetype: 2 = character device for stdio
      view.setUint8(0, fd <= 2 ? 2 : 4);
      view.setUint16(2, 0, true); // fs_flags
      view.setBigUint64(8, 0xffffffffffffffffn, true); // rights base
      view.setBigUint64(16, 0xffffffffffffffffn, true); // rights inheriting
      return 0;
    },

    fd_fdstat_set_flags: (fd, flags) => 0,
    fd_prestat_get: (fd, buf) => 8, // __WASI_ERRNO_BADF (no preopens)
    fd_prestat_dir_name: (fd, path, path_len) => 8,
    path_open: () => 44, // __WASI_ERRNO_NOENT
    path_filestat_get: () => 44,
    random_get: (buf, buf_len) => {
      const mem = getMemory();
      const u8 = new Uint8Array(mem.buffer, buf, buf_len);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(u8);
      } else {
        for (let i = 0; i < buf_len; i++) u8[i] = Math.floor(Math.random() * 256);
      }
      return 0;
    },
    sched_yield: () => 0
  };
}

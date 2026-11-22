/**
 * raylib-wasi Standalone Host Runtime Bridge
 * Vanilla ES module for WebGL, input sync, Web Audio & WASI execution (powered by wasi-host)
 * https://github.com/breeze833/raylib-wasi
 */

// WASI Preview 1 (wasi_snapshot_preview1) Standard Constants

// Error codes (errno)
const ESUCCESS = 0;
const EBADF = 8;
const EEXIST = 20;
const EINVAL = 28;
const EISDIR = 31;
const ENOENT = 44;
const ENOSYS = 52;
const ENOTDIR = 54;
const EPERM = 63;
const EROFS = 65;
const ENOTEMPTY = 66;

// File types (__wasi_filetype_t)
const FILETYPE_UNKNOWN = 0;
const FILETYPE_BLOCK_DEVICE = 1;
const FILETYPE_CHARACTER_DEVICE = 2;
const FILETYPE_DIRECTORY = 3;
const FILETYPE_REGULAR_FILE = 4;
const FILETYPE_SOCKET_DGRAM = 5;
const FILETYPE_SOCKET_STREAM = 6;
const FILETYPE_SYMBOLIC_LINK = 7;

// Preopen types (__wasi_preopentype_t)
const PREOPENTYPE_DIR = 0;

// Open flags (__wasi_oflags_t)
const O_CREAT = 1;
const O_DIRECTORY = 2;
const O_EXCL = 4;
const O_TRUNC = 8;

// File descriptor flags (__wasi_fdflags_t)
const FDFLAG_APPEND = 1;
const FDFLAG_DSYNC = 2;
const FDFLAG_NONBLOCK = 4;
const FDFLAG_RSYNC = 8;
const FDFLAG_SYNC = 16;

// Seek whence (__wasi_whence_t)
const WHENCE_SET = 0;
const WHENCE_CUR = 1;
const WHENCE_END = 2;

// Clock IDs (__wasi_clockid_t)
const CLOCKID_REALTIME = 0;
const CLOCKID_MONOTONIC = 1;
const CLOCKID_PROCESS_CPUTIME_ID = 2;
const CLOCKID_THREAD_CPUTIME_ID = 3;

// Event types & clock flags
const EVENTTYPE_CLOCK = 0;
const EVENTTYPE_FD_READ = 1;
const EVENTTYPE_FD_WRITE = 2;
const SUBCLOCKFLAGS_ABSTIME = 1;

// Filestat time flags (__wasi_fstflags_t)
const FSTFLAGS_ATIM = 1;
const FSTFLAGS_ATIM_NOW = 2;
const FSTFLAGS_MTIM = 4;
const FSTFLAGS_MTIM_NOW = 8;

// Capability rights (__wasi_rights_t)
const RIGHTS_ALL = 0x1fffffffffffffffn;
const RIGHT_FD_READ = 1n << 1n;
const RIGHT_FD_SEEK = 1n << 2n;
const RIGHT_FD_TELL = 1n << 5n;
const RIGHT_FD_WRITE = 1n << 6n;
const RIGHTS_TTY = RIGHTS_ALL & ~(RIGHT_FD_SEEK | RIGHT_FD_TELL);


// Unified Virtual File System Adapter
// Normalizes access across vfs-wasi OverlayVFS, Map<string, Uint8Array|string>, and plain objects.


const wasiAdapterTextEncoder = new TextEncoder();

/**
 * Normalizes a POSIX path string.
 * Preserves leading slash distinction (absolute vs. relative), collapses redundant slashes,
 * resolves '.' and '..' segments without escaping '/', and strips trailing slashes (except '/').
 *
 * @param {string} path
 * @returns {string}
 */
function normalizePath(path) {
  if (!path) return '/';
  const isAbsolute = path.startsWith('/');
  const parts = path.split('/').filter((p) => p && p !== '.');
  const resolved = [];

  for (const part of parts) {
    if (part === '..') {
      if (resolved.length > 0) resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  const result = (isAbsolute ? '/' : '') + resolved.join('/');
  return result === '' ? '/' : result;
}

/**
 * Converts arbitrary stored payloads (Uint8Array, ArrayBuffer, string, or wrapper object)
 * into a Uint8Array.
 *
 * @param {any} value
 * @returns {Uint8Array}
 */
function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === 'string') return wasiAdapterTextEncoder.encode(value);
  if (value && typeof value === 'object') {
    if (value.data !== undefined) return toUint8Array(value.data);
    if (value.contents !== undefined) return toUint8Array(value.contents);
    if (value.content !== undefined) return toUint8Array(value.content);
  }
  return new Uint8Array(0);
}

/**
 * Adapter providing a consistent filesystem interface over OverlayVFS, Map, or plain objects.
 */
class VfsAdapter {
  /**
   * @param {object|Map|null} vfs
   * @param {Set<string>} [createdDirs]
   */
  constructor(vfs = new Map(), createdDirs = new Set(['/'])) {
    this.vfs = vfs;
    this.createdDirs = createdDirs;
  }

  /**
   * Checks whether a path is protected as read-only by the underlying VFS.
   * @param {string} path
   * @returns {boolean}
   */
  isReadOnly(path) {
    if (this.vfs && typeof this.vfs._isReadOnly === 'function') {
      return Boolean(this.vfs._isReadOnly(path));
    }
    return false;
  }

  /**
   * Checks whether a file or directory exists at the normalized path.
   * @param {string} path
   * @returns {boolean}
   */
  exists(path) {
    if (!this.vfs) return false;
    const norm = normalizePath(path);
    if (norm === '/') return true;
    if (typeof this.vfs.exists === 'function') return Boolean(this.vfs.exists(norm));
    if (this.vfs instanceof Map) return this.vfs.has(norm) || this.isDir(norm);
    if (typeof this.vfs === 'object') {
      return Object.prototype.hasOwnProperty.call(this.vfs, norm) || this.isDir(norm);
    }
    return false;
  }

  /**
   * Checks whether the normalized path is a directory.
   * @param {string} path
   * @returns {boolean}
   */
  isDir(path) {
    if (!this.vfs) return false;
    const norm = normalizePath(path);
    if (norm === '/') return true;
    if (this.createdDirs && this.createdDirs.has(norm)) return true;

    if (typeof this.vfs.isDir === 'function') {
      return Boolean(this.vfs.isDir(norm));
    }
    if (typeof this.vfs.stat === 'function') {
      const s = this.vfs.stat(norm);
      return s ? Boolean(s.isDir || s.isDirectory) : false;
    }

    if (this.vfs instanceof Map) {
      if (this.vfs.has(norm)) {
        const item = this.vfs.get(norm);
        if (item && typeof item === 'object' && item.isDir !== undefined) {
          return Boolean(item.isDir);
        }
        return false;
      }
      const prefix = `${norm}/`;
      for (const k of this.vfs.keys()) {
        if (normalizePath(k).startsWith(prefix)) return true;
      }
      return false;
    }

    if (typeof this.vfs === 'object') {
      if (Object.prototype.hasOwnProperty.call(this.vfs, norm)) {
        const item = this.vfs[norm];
        if (item && typeof item === 'object' && item.isDir !== undefined) {
          return Boolean(item.isDir);
        }
        return false;
      }
      const prefix = `${norm}/`;
      for (const k of Object.keys(this.vfs)) {
        if (normalizePath(k).startsWith(prefix)) return true;
      }
      return false;
    }

    return false;
  }

  /**
   * Returns file/directory metadata `{ isDir, size, mtime }` or null if not found.
   * @param {string} path
   * @returns {{ isDir: boolean, size: number, mtime: number } | null}
   */
  stat(path) {
    if (!this.vfs) return null;
    const norm = normalizePath(path);

    if (typeof this.vfs.stat === 'function') {
      const st = this.vfs.stat(norm);
      if (st) {
        return {
          isDir: Boolean(st.isDir || st.isDirectory),
          size: Number(st.size || 0),
          mtime: Number(st.mtime || Date.now()),
        };
      }
    }

    if (this.isDir(norm)) {
      return { isDir: true, size: 0, mtime: Date.now() };
    }

    if (this.exists(norm)) {
      const bytes = this.readFile(norm);
      return { isDir: false, size: bytes.length, mtime: Date.now() };
    }

    return null;
  }

  /**
   * Reads file bytes from the underlying VFS.
   * @param {string} path
   * @returns {Uint8Array}
   */
  readFile(path) {
    if (!this.vfs) return new Uint8Array(0);
    const norm = normalizePath(path);
    let raw = null;

    if (typeof this.vfs.readFile === 'function') {
      raw = this.vfs.readFile(norm, false);
    } else if (this.vfs instanceof Map) {
      raw = this.vfs.get(norm);
    } else if (typeof this.vfs === 'object') {
      raw = this.vfs[norm];
    }

    return toUint8Array(raw);
  }

  /**
   * Writes file bytes into the underlying VFS, creating parent directories if needed.
   * @param {string} path
   * @param {Uint8Array|ArrayBuffer|string} data
   */
  writeFile(path, data) {
    const norm = normalizePath(path);
    if (this.isReadOnly(norm)) {
      const err = new Error(`EROFS: read-only file system, open '${norm}'`);
      err.errno = EROFS;
      throw err;
    }

    const bytes = toUint8Array(data);
    let dirP = norm;
    while (dirP.lastIndexOf('/') > 0) {
      dirP = dirP.substring(0, dirP.lastIndexOf('/'));
      this.createdDirs.add(dirP);
    }

    if (!this.vfs) return bytes;

    if (typeof this.vfs.writeFile === 'function') {
      const lastSlash = norm.lastIndexOf('/');
      if (lastSlash > 0) {
        const parentDir = norm.substring(0, lastSlash);
        if (!this.exists(parentDir)) {
          try {
            this._callMkdir(parentDir, true);
          } catch {}
        }
      }
      this.vfs.writeFile(norm, bytes, { mtime: Date.now(), allowReadOnly: false });
    } else if (this.vfs instanceof Map) {
      this.vfs.set(norm, bytes);
    } else if (typeof this.vfs === 'object') {
      this.vfs[norm] = bytes;
    }

    return bytes;
  }

  /**
   * Creates a directory in the underlying VFS.
   * @param {string} path
   * @param {boolean} [recursive=false]
   */
  mkdir(path, recursive = false) {
    const norm = normalizePath(path);
    if (this.isReadOnly(norm)) {
      const err = new Error(`EROFS: read-only file system, mkdir '${norm}'`);
      err.errno = EROFS;
      throw err;
    }

    if (this.vfs && typeof this.vfs.mkdir === 'function') {
      this._callMkdir(norm, recursive);
    }
    this.createdDirs.add(norm);
  }

  _callMkdir(norm, recursive) {
    this.vfs.mkdir(norm, { recursive, allowReadOnly: false });
  }

  /**
   * Removes a regular file from the underlying VFS.
   * @param {string} path
   */
  removeFile(path) {
    const norm = normalizePath(path);
    if (this.isReadOnly(norm)) {
      const err = new Error(`EROFS: read-only file system, unlink '${norm}'`);
      err.errno = EROFS;
      throw err;
    }

    if (!this.vfs) return;

    if (typeof this.vfs.removeFile === 'function') {
      this.vfs.removeFile(norm);
    } else if (typeof this.vfs.remove === 'function') {
      this.vfs.remove(norm, true, false);
    } else if (this.vfs instanceof Map) {
      this.vfs.delete(norm);
    } else if (typeof this.vfs === 'object') {
      delete this.vfs[norm];
    }
  }

  /**
   * Removes an empty directory from the underlying VFS.
   * @param {string} path
   */
  removeDir(path) {
    const norm = normalizePath(path);
    if (this.isReadOnly(norm)) {
      const err = new Error(`EROFS: read-only file system, rmdir '${norm}'`);
      err.errno = EROFS;
      throw err;
    }

    const children = this.readDir(norm);
    if (children.length > 0) {
      const err = new Error(`ENOTEMPTY: directory not empty, rmdir '${norm}'`);
      err.errno = ENOTEMPTY;
      throw err;
    }

    if (this.vfs) {
      if (typeof this.vfs.removeDir === 'function') {
        this.vfs.removeDir(norm, false);
      } else if (typeof this.vfs.rmdir === 'function') {
        this.vfs.rmdir(norm, false, false);
      } else if (typeof this.vfs.remove === 'function') {
        this.vfs.remove(norm, false, false);
      } else if (this.vfs instanceof Map) {
        const entry = this.vfs.get(norm);
        if (entry && typeof entry === 'object' && entry.isDir) {
          this.vfs.delete(norm);
        }
      } else if (typeof this.vfs === 'object') {
        const entry = this.vfs[norm];
        if (entry && typeof entry === 'object' && entry.isDir) {
          delete this.vfs[norm];
        }
      }
    }

    this.createdDirs.delete(norm);
  }

  /**
   * Renames or moves a file or directory.
   * @param {string} oldPath
   * @param {string} newPath
   */
  rename(oldPath, newPath) {
    const oldNorm = normalizePath(oldPath);
    const newNorm = normalizePath(newPath);

    if (this.isReadOnly(oldNorm) || this.isReadOnly(newNorm)) {
      const err = new Error(`EROFS: read-only file system, rename '${oldNorm}' -> '${newNorm}'`);
      err.errno = EROFS;
      throw err;
    }

    if (this.vfs && typeof this.vfs.rename === 'function') {
      try {
        this.vfs.rename(oldNorm, newNorm, true);
      } catch (err) {
        if (!err.errno) err.errno = EEXIST;
        throw err;
      }
      return;
    }

    if (this.isDir(oldNorm)) {
      const prefix = `${oldNorm}/`;
      const toMove = [];
      if (this.vfs instanceof Map) {
        for (const [k, v] of this.vfs.entries()) {
          const nk = normalizePath(k);
          if (nk === oldNorm || nk.startsWith(prefix)) {
            toMove.push([nk, v]);
          }
        }
        for (const [nk, v] of toMove) {
          this.vfs.delete(nk);
          const suffix = nk.substring(oldNorm.length);
          this.vfs.set(newNorm + suffix, v);
        }
      } else if (this.vfs && typeof this.vfs === 'object') {
        for (const k of Object.keys(this.vfs)) {
          const nk = normalizePath(k);
          if (nk === oldNorm || nk.startsWith(prefix)) {
            toMove.push([nk, this.vfs[k]]);
          }
        }
        for (const [nk, v] of toMove) {
          delete this.vfs[nk];
          const suffix = nk.substring(oldNorm.length);
          this.vfs[newNorm + suffix] = v;
        }
      }
      this.createdDirs.delete(oldNorm);
      this.createdDirs.add(newNorm);
      return;
    }

    const bytes = this.readFile(oldNorm);
    this.writeFile(newNorm, bytes);
    this.removeFile(oldNorm);
  }

  /**
   * Updates modification/access timestamps on a file or directory.
   * @param {string} path
   * @param {bigint} atimNs
   * @param {bigint} mtimNs
   */
  setTimes(path, atimNs, mtimNs) {
    const norm = normalizePath(path);
    if (this.isReadOnly(norm)) {
      const err = new Error(`EROFS: read-only file system, utime '${norm}'`);
      err.errno = EROFS;
      throw err;
    }
    if (!this.vfs) return;

    if (typeof this.vfs.setTimes === 'function') {
      this.vfs.setTimes(norm, atimNs, mtimNs);
      return;
    }
    if (typeof this.vfs._resolve === 'function') {
      const node = this.vfs._resolve(norm);
      if (node) {
        node.mtime = Number(mtimNs / 1000000n);
        if (typeof this.vfs._notify === 'function') {
          this.vfs._notify({ type: 'write', path: norm, isDir: node.isDir, mtime: node.mtime });
        }
      }
    }
  }

  /**
   * Lists directory entries at the normalized path.
   * @param {string} path
   * @returns {Array<{ name: string, isDir: boolean }>}
   */
  readDir(path) {
    if (!this.vfs) return [];
    const norm = normalizePath(path);

    if (typeof this.vfs.readDir === 'function') {
      const items = this.vfs.readDir(norm);
      return items.map((i) => ({
        name: typeof i === 'string' ? i : i.name,
        isDir: typeof i === 'string'
          ? this.isDir(norm === '/' ? `/${i}` : `${norm}/${i}`)
          : Boolean(i.isDir || i.isDirectory),
      }));
    }

    const prefix = norm === '/' ? '/' : `${norm}/`;
    const seen = new Map();
    const keys = this.vfs instanceof Map ? Array.from(this.vfs.keys()) : Object.keys(this.vfs);

    for (const rawKey of keys) {
      const k = normalizePath(rawKey);
      if (k.startsWith(prefix)) {
        const rest = k.substring(prefix.length);
        if (!rest) continue;
        const slashIdx = rest.indexOf('/');
        const name = slashIdx === -1 ? rest : rest.substring(0, slashIdx);
        if (!name) continue;
        const isDir = slashIdx !== -1 || (
          this.vfs instanceof Map
            ? Boolean(this.vfs.get(rawKey)?.isDir)
            : Boolean(this.vfs[rawKey]?.isDir)
        );
        if (!seen.has(name) || isDir) {
          seen.set(name, { name, isDir });
        }
      }
    }

    for (const dirPath of this.createdDirs) {
      if (dirPath !== '/' && dirPath.startsWith(prefix)) {
        const rest = dirPath.substring(prefix.length);
        const name = rest.split('/')[0];
        if (name && !seen.has(name)) {
          seen.set(name, { name, isDir: true });
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Maps an internal error into a WASI errno fallback.
   * @param {any} err
   * @param {number} [fallback=EPERM]
   * @returns {number}
   */
  static mapErrorToErrno(err, fallback = EPERM) {
    if (err && typeof err.errno === 'number') return err.errno;
    if (err && typeof err.message === 'string') {
      if (err.message.includes('EROFS')) return EROFS;
      if (err.message.includes('not empty') || err.message.includes('ENOTEMPTY')) return ENOTEMPTY;
      if (err.message.includes('exists') || err.message.includes('EEXIST')) return EEXIST;
    }
    return fallback;
  }
}


// Language-Neutral WASI Preview 1 (wasi_snapshot_preview1) Process & Execution Host
// Zero runtime dependencies; composes with vfs-wasi, stdin-wasi, and busybox-wasi.




const wasiCoreTextEncoder = new TextEncoder();
const wasiCoreTextDecoder = new TextDecoder('utf-8', { fatal: false });
const WASI_HAS_SAB = typeof SharedArrayBuffer !== 'undefined';

/**
 * Error thrown by WASI `proc_exit(code)` to unwind guest execution cleanly
 * while carrying the exit code and tracked filesystem mutations.
 */
class ProcExit extends Error {
  /**
   * @param {number} code
   * @param {Map<string, Uint8Array>|null} [changedFiles=null]
   * @param {Set<string>|null} [deletedFiles=null]
   */
  constructor(code, changedFiles = null, deletedFiles = null) {
    super(`Exited with code ${code}`);
    this.name = 'ProcExit';
    this.code = code;
    this.changedFiles = changedFiles;
    this.deletedFiles = deletedFiles;
  }
}

/**
 * Pure JavaScript WASI Preview 1 (`wasi_snapshot_preview1` & `wasi_unstable`) host runtime.
 */
class WasiHost {
  /**
   * @param {object} [options]
   */
  constructor(options = {}) {
    this.cwd = normalizePath(options.cwd || '/');
    this.argv = Array.isArray(options.argv) ? [...options.argv] : ['wasm'];
    this.environ = {
      HOME: this.cwd,
      PWD: this.cwd,
      ...(options.environ || {}),
    };

    if (typeof options.stdin === 'string') {
      this.stdin = wasiCoreTextEncoder.encode(options.stdin);
    } else {
      this.stdin = options.stdin || null;
    }
    this.stdinPos = 0;

    this.stdout = options.stdout || (() => {});
    this.stderr = options.stderr || this.stdout;
    this.getMemory = options.getMemory || null;

    this.preopens = Array.isArray(options.preopens)
      ? options.preopens.map((p) => ({
          fd: p.fd,
          path: normalizePath(p.path),
          name: p.name !== undefined ? p.name : p.path,
        }))
      : [
          { fd: 3, path: this.cwd, name: '.' },
          { fd: 4, path: '/', name: '/' },
        ];

    const rawSystemDirs = Array.isArray(options.systemDirs) ? options.systemDirs : ['/dev'];
    this.systemDirs = new Set(rawSystemDirs.map((d) => normalizePath(d)));
    this.systemDirs.add('/dev');

    this.nextFd = typeof options.nextFd === 'number' ? options.nextFd : 10;
    this.onFileSync = options.onFileSync || null;
    this.onFileDelete = options.onFileDelete || null;
    this.wasiWrapper = options.wasiWrapper || null;
    this.envProvider = options.envProvider || null;
    this.customFsImports = options.fsImports || null;
    this.strictStubs = Boolean(options.strictStubs);

    this.changedFiles = new Map();
    this.deletedFiles = new Set();
    this.createdDirs = new Set(['/', ...this.systemDirs]);
    if (this.cwd && this.cwd !== '/') {
      this.createdDirs.add(this.cwd);
    }

    this.vfs = options.vfs !== undefined ? options.vfs : new Map();
    this.vfsAdapter = new VfsAdapter(this.vfs, this.createdDirs);

    this.openFiles = new Map();
    this.openFiles.set(0, { fd: 0, isStdio: true, canRead: true, canWrite: false, isDir: false });
    this.openFiles.set(1, { fd: 1, isStdio: true, canRead: false, canWrite: true, isDir: false });
    this.openFiles.set(2, { fd: 2, isStdio: true, canRead: false, canWrite: true, isDir: false });

    this._reservedFds = new Set();
    this.inodes = new Map();
    this.nextInode = 100n;
    this._sleepSyncBuffer = null;
  }

  /**
   * Binds WebAssembly linear memory (instance or getter function).
   * @param {WebAssembly.Memory|(() => WebAssembly.Memory)} memoryOrGetter
   */
  setMemory(memoryOrGetter) {
    this.getMemory = memoryOrGetter;
  }

  /**
   * Returns the active WebAssembly.Memory instance.
   * @returns {WebAssembly.Memory}
   */
  mem() {
    const memory = typeof this.getMemory === 'function' ? this.getMemory() : this.getMemory;
    if (!memory || !memory.buffer) {
      throw new Error('WasiHost: WebAssembly.Memory is not available or detached.');
    }
    return memory;
  }

  memU8() {
    return new Uint8Array(this.mem().buffer);
  }

  memView() {
    return new DataView(this.mem().buffer);
  }

  /**
   * Allocates the next available file descriptor >= max(minFd, nextFd).
   * Reserves the descriptor to guarantee uniqueness across consecutive calls.
   *
   * @param {number} [minFd=0]
   * @returns {number}
   */
  allocateFd(minFd = 0) {
    const preopenFds = new Set(this.preopens.map((p) => p.fd));
    let fd = Math.max(Number(minFd) || 0, this.nextFd);
    while (this.openFiles.has(fd) || preopenFds.has(fd) || this._reservedFds.has(fd)) {
      fd++;
    }
    this._reservedFds.add(fd);
    if (fd >= this.nextFd) {
      this.nextFd = fd + 1;
    }
    return fd;
  }

  _getInode(path) {
    const norm = normalizePath(path);
    if (!this.inodes.has(norm)) {
      this.inodes.set(norm, this.nextInode++);
    }
    return this.inodes.get(norm);
  }

  /**
   * Decodes a UTF-8 string from WebAssembly linear memory safely (SharedArrayBuffer compliant).
   * @param {number} offset
   * @param {number} [len=-1]
   * @returns {string}
   */
  readStr(offset, len = -1) {
    const u8 = this.memU8();
    let end = offset;
    if (len !== -1 && len !== undefined) {
      if (len === 0) return '';
      end = offset + len;
    } else {
      while (end < u8.length && u8[end] !== 0) {
        end++;
      }
    }

    const slice = u8.subarray(offset, end);
    if (WASI_HAS_SAB && u8.buffer instanceof SharedArrayBuffer) {
      const unshared = new Uint8Array(slice.length);
      unshared.set(slice);
      return wasiCoreTextDecoder.decode(unshared);
    }
    return wasiCoreTextDecoder.decode(slice);
  }

  _isSystemRelPath(cleanRel) {
    for (const sysDir of this.systemDirs) {
      const stripped = sysDir.replace(/^\/+/, '');
      if (stripped && (cleanRel === stripped || cleanRel.startsWith(`${stripped}/`))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Resolves a path relative to a preopened or opened directory file descriptor.
   * @param {number} dirfd
   * @param {string} pathStr
   * @returns {string}
   */
  resolvePath(dirfd, pathStr) {
    let base = this.cwd;
    for (const preopen of this.preopens) {
      if (preopen.fd === dirfd) {
        base = preopen.path;
        break;
      }
    }
    const openEntry = this.openFiles.get(dirfd);
    if (openEntry && openEntry.isDir && openEntry.path) {
      base = openEntry.path;
    }

    if (!pathStr || pathStr === '.') return normalizePath(base);
    if (pathStr.startsWith('/')) return normalizePath(pathStr);

    const clean = pathStr.replace(/^\.?\/+/, '');
    if (!clean) return normalizePath(base);

    const candidate = normalizePath(`${base}/${clean}`);
    if (candidate === '/dev/null' || candidate === '/dev/zero') {
      return candidate;
    }
    if (this.vfsAdapter.exists(candidate) || this.vfsAdapter.isDir(candidate)) {
      return candidate;
    }

    if (base === '/' && this.cwd && this.cwd !== '/') {
      const firstSegment = clean.split('/')[0];
      const isRootEntry = this.vfsAdapter.isDir('/' + firstSegment) || this.vfsAdapter.exists('/' + firstSegment);
      if (!isRootEntry) {
        const cwdCandidate = normalizePath(`${this.cwd}/${clean}`);
        if (this.vfsAdapter.exists(cwdCandidate) || this.vfsAdapter.isDir(cwdCandidate)) {
          return cwdCandidate;
        }
        if (!this._isSystemRelPath(clean)) {
          return cwdCandidate;
        }
      }
    }

    if (this._isSystemRelPath(clean)) {
      const rootCandidate = normalizePath(`/${clean}`);
      if (
        rootCandidate === '/dev/null' ||
        rootCandidate === '/dev/zero' ||
        this.vfsAdapter.exists(rootCandidate) ||
        this.vfsAdapter.isDir(rootCandidate)
      ) {
        return rootCandidate;
      }
    }

    return candidate;
  }

  _writeFileAndTrack(fullPath, bytes) {
    const written = this.vfsAdapter.writeFile(fullPath, bytes);
    this.changedFiles.set(fullPath, written);
    this.deletedFiles.delete(fullPath);
    if (this.onFileSync) {
      try {
        this.onFileSync(fullPath, written);
      } catch {}
    }
    return written;
  }

  _removeFileAndTrack(fullPath) {
    this.vfsAdapter.removeFile(fullPath);
    this.changedFiles.delete(fullPath);
    this.deletedFiles.add(fullPath);
    if (this.onFileDelete) {
      try {
        this.onFileDelete(fullPath);
      } catch {}
    }
  }

  _writeFilestat(view, statOut, { ino, filetype, size, mtimeMs }) {
    this.memU8().fill(0, statOut, statOut + 64);
    const tsNs = BigInt(Math.max(0, Math.floor(mtimeMs || Date.now()))) * 1000000n;
    view.setBigUint64(statOut, 1n, true); // st_dev
    view.setBigUint64(statOut + 8, ino, true); // st_ino
    view.setUint8(statOut + 16, filetype); // st_filetype
    view.setBigUint64(statOut + 24, 1n, true); // st_nlink
    view.setBigUint64(statOut + 32, BigInt(size || 0), true); // st_size
    view.setBigUint64(statOut + 40, tsNs, true); // st_atim
    view.setBigUint64(statOut + 48, tsNs, true); // st_mtim
    view.setBigUint64(statOut + 56, tsNs, true); // st_ctim
  }

  _writeFdstat(view, statOut, { filetype, fdflags = 0, rightsBase = RIGHTS_ALL, rightsInheriting = RIGHTS_ALL }) {
    this.memU8().fill(0, statOut, statOut + 24);
    view.setUint8(statOut, filetype);
    view.setUint16(statOut + 2, fdflags, true);
    view.setBigUint64(statOut + 8, rightsBase, true);
    view.setBigUint64(statOut + 16, rightsInheriting, true);
  }

  _readIovecs(view, iovsPtr, iovsLen) {
    const result = [];
    for (let i = 0; i < iovsLen; i++) {
      const base = iovsPtr + i * 8;
      result.push({
        ptr: view.getUint32(base, true),
        len: view.getUint32(base + 4, true),
      });
    }
    return result;
  }

  _resolveMtimeNs(fstFlags, mtim) {
    const nowNs = BigInt(Date.now()) * 1000000n;
    if ((fstFlags & FSTFLAGS_MTIM) !== 0) return mtim;
    if ((fstFlags & FSTFLAGS_MTIM_NOW) !== 0) return nowNs;
    return nowNs;
  }

  _resolveAtimeNs(fstFlags, atim) {
    const nowNs = BigInt(Date.now()) * 1000000n;
    if ((fstFlags & FSTFLAGS_ATIM) !== 0) return atim;
    if ((fstFlags & FSTFLAGS_ATIM_NOW) !== 0) return nowNs;
    return nowNs;
  }

  _getPreopen(fd) {
    for (const preopen of this.preopens) {
      if (preopen.fd === fd) return preopen;
    }
    return null;
  }

  _isCharDevPath(fullPath) {
    return fullPath === '/dev/null' || fullPath === '/dev/zero';
  }

  _openEntry(entry) {
    this._reservedFds.delete(entry.fd);
    this.openFiles.set(entry.fd, entry);
  }

  _readDirWithDevices(dirPath) {
    const entries = this.vfsAdapter.readDir(dirPath);
    if (normalizePath(dirPath) === '/dev') {
      const names = new Set(entries.map((e) => e.name));
      if (!names.has('null')) entries.push({ name: 'null', isDir: false, isCharDev: true });
      if (!names.has('zero')) entries.push({ name: 'zero', isDir: false, isCharDev: true });
    }
    return entries;
  }

  /**
   * Builds and returns the WASI Preview 1 syscall table (`wasi_snapshot_preview1`).
   * @returns {Record<string, Function>}
   */
  getImports() {
    const wasi = {
      proc_exit: (code) => {
        throw new ProcExit(code, this.changedFiles, this.deletedFiles);
      },

      fd_prestat_get: (fd, statOut) => {
        const preopen = this._getPreopen(fd);
        if (!preopen) return EBADF;
        const view = this.memView();
        const nameBytes = wasiCoreTextEncoder.encode(preopen.name);
        view.setUint32(statOut, PREOPENTYPE_DIR, true);
        view.setUint32(statOut + 4, nameBytes.length, true);
        return ESUCCESS;
      },

      fd_prestat_dir_name: (fd, pathPtr, pathLen) => {
        const preopen = this._getPreopen(fd);
        if (!preopen) return EBADF;
        const nameBytes = wasiCoreTextEncoder.encode(preopen.name);
        const toCopy = Math.min(nameBytes.length, pathLen);
        this.memU8().set(nameBytes.subarray(0, toCopy), pathPtr);
        return ESUCCESS;
      },

      fd_fdstat_get: (fd, statOut) => {
        const view = this.memView();
        const file = this.openFiles.get(fd);
        if ((fd === 0 || fd === 1 || fd === 2) && (!file || file.isStdio)) {
          this._writeFdstat(view, statOut, {
            filetype: FILETYPE_CHARACTER_DEVICE,
            rightsBase: RIGHTS_TTY,
            rightsInheriting: RIGHTS_TTY,
          });
          return ESUCCESS;
        }

        if (this._getPreopen(fd)) {
          this._writeFdstat(view, statOut, { filetype: FILETYPE_DIRECTORY });
          return ESUCCESS;
        }

        if (!file) return EBADF;

        if (file.isCharDev) {
          this._writeFdstat(view, statOut, { filetype: FILETYPE_CHARACTER_DEVICE });
          return ESUCCESS;
        }

        this._writeFdstat(view, statOut, {
          filetype: file.isDir ? FILETYPE_DIRECTORY : FILETYPE_REGULAR_FILE,
          fdflags: file.isAppend ? FDFLAG_APPEND : 0,
        });
        return ESUCCESS;
      },

      fd_fdstat_set_flags: (fd, flags) => {
        const file = this.openFiles.get(fd);
        if (!file) return EBADF;
        file.isAppend = (flags & FDFLAG_APPEND) !== 0;
        return ESUCCESS;
      },

      fd_fdstat_set_rights: () => ESUCCESS,

      fd_filestat_get: (fd, statOut) => {
        const view = this.memView();
        if (fd === 0 || fd === 1 || fd === 2) {
          this._writeFilestat(view, statOut, {
            ino: BigInt(fd),
            filetype: FILETYPE_CHARACTER_DEVICE,
            size: 0,
            mtimeMs: Date.now(),
          });
          return ESUCCESS;
        }

        const preopen = this._getPreopen(fd);
        if (preopen) {
          const st = this.vfsAdapter.stat(preopen.path);
          this._writeFilestat(view, statOut, {
            ino: this._getInode(preopen.path),
            filetype: FILETYPE_DIRECTORY,
            size: 0,
            mtimeMs: st ? st.mtime : Date.now(),
          });
          return ESUCCESS;
        }

        const file = this.openFiles.get(fd);
        if (!file) return EBADF;

        if (file.isCharDev) {
          this._writeFilestat(view, statOut, {
            ino: this._getInode(file.path),
            filetype: FILETYPE_CHARACTER_DEVICE,
            size: 0,
            mtimeMs: Date.now(),
          });
          return ESUCCESS;
        }

        const st = this.vfsAdapter.stat(file.path);
        if (file.isDir) {
          this._writeFilestat(view, statOut, {
            ino: this._getInode(file.path),
            filetype: FILETYPE_DIRECTORY,
            size: 0,
            mtimeMs: st ? st.mtime : Date.now(),
          });
          return ESUCCESS;
        }

        const data = this.vfsAdapter.readFile(file.path);
        this._writeFilestat(view, statOut, {
          ino: this._getInode(file.path),
          filetype: FILETYPE_REGULAR_FILE,
          size: data.length,
          mtimeMs: st ? st.mtime : Date.now(),
        });
        return ESUCCESS;
      },

      fd_filestat_set_size: (fd, size) => {
        const file = this.openFiles.get(fd);
        if (!file || file.isDir || !file.canWrite) return EBADF;
        if (file.isCharDev) return ESUCCESS;
        if (this.vfsAdapter.isReadOnly(file.path)) return EROFS;

        const targetLen = Math.max(0, Number(size));
        const data = this.vfsAdapter.readFile(file.path);
        const nextData = new Uint8Array(targetLen);
        nextData.set(data.subarray(0, Math.min(data.length, targetLen)));
        this._writeFileAndTrack(file.path, nextData);
        return ESUCCESS;
      },

      fd_filestat_set_times: (fd, atim, mtim, fstFlags) => {
        const preopen = this._getPreopen(fd);
        const targetPath = preopen ? preopen.path : this.openFiles.get(fd)?.path;
        if (!targetPath) return EBADF;
        if (this.vfsAdapter.isReadOnly(targetPath)) return EROFS;
        try {
          this.vfsAdapter.setTimes(
            targetPath,
            this._resolveAtimeNs(fstFlags, atim),
            this._resolveMtimeNs(fstFlags, mtim)
          );
          if (!this.vfsAdapter.isDir(targetPath) && this.vfsAdapter.exists(targetPath)) {
            const bytes = this.vfsAdapter.readFile(targetPath);
            this.changedFiles.set(targetPath, bytes);
          }
          return ESUCCESS;
        } catch (err) {
          return VfsAdapter.mapErrorToErrno(err, EPERM);
        }
      },

      path_filestat_get: (dirfd, flags, pathPtr, pathLen, statOut) => {
        const pathStr = this.readStr(pathPtr, pathLen);
        const fullPath = this.resolvePath(dirfd, pathStr);
        const view = this.memView();

        if (this._isCharDevPath(fullPath)) {
          this._writeFilestat(view, statOut, {
            ino: this._getInode(fullPath),
            filetype: FILETYPE_CHARACTER_DEVICE,
            size: 0,
            mtimeMs: Date.now(),
          });
          return ESUCCESS;
        }

        if (this.vfsAdapter.isDir(fullPath)) {
          const st = this.vfsAdapter.stat(fullPath);
          this._writeFilestat(view, statOut, {
            ino: this._getInode(fullPath),
            filetype: FILETYPE_DIRECTORY,
            size: 0,
            mtimeMs: st ? st.mtime : Date.now(),
          });
          return ESUCCESS;
        }

        if (this.vfsAdapter.exists(fullPath)) {
          const st = this.vfsAdapter.stat(fullPath);
          const data = this.vfsAdapter.readFile(fullPath);
          this._writeFilestat(view, statOut, {
            ino: this._getInode(fullPath),
            filetype: FILETYPE_REGULAR_FILE,
            size: data.length,
            mtimeMs: st ? st.mtime : Date.now(),
          });
          return ESUCCESS;
        }

        return ENOENT;
      },

      path_filestat_set_times: (dirfd, flags, pathPtr, pathLen, atim, mtim, fstFlags) => {
        const pathStr = this.readStr(pathPtr, pathLen);
        const fullPath = this.resolvePath(dirfd, pathStr);
        if (!this.vfsAdapter.exists(fullPath) && !this.vfsAdapter.isDir(fullPath)) {
          return ENOENT;
        }
        if (this.vfsAdapter.isReadOnly(fullPath)) return EROFS;
        try {
          this.vfsAdapter.setTimes(
            fullPath,
            this._resolveAtimeNs(fstFlags, atim),
            this._resolveMtimeNs(fstFlags, mtim)
          );
          if (!this.vfsAdapter.isDir(fullPath) && this.vfsAdapter.exists(fullPath)) {
            const bytes = this.vfsAdapter.readFile(fullPath);
            this.changedFiles.set(fullPath, bytes);
          }
          return ESUCCESS;
        } catch (err) {
          return VfsAdapter.mapErrorToErrno(err, EPERM);
        }
      },

      path_open: (
        dirfd,
        dirflags,
        pathPtr,
        pathLen,
        oflags,
        fsRightsBase,
        fsRightsInheriting,
        fdflags,
        openedFdPtr
      ) => {
        const pathStr = this.readStr(pathPtr, pathLen);
        const fullPath = this.resolvePath(dirfd, pathStr);
        const view = this.memView();

        if (this._isCharDevPath(fullPath)) {
          if (oflags & O_DIRECTORY) return ENOTDIR;
          const fd = this.allocateFd();
          this._openEntry({
            fd,
            path: fullPath,
            isCharDev: true,
            isDevNull: fullPath === '/dev/null',
            isDevZero: fullPath === '/dev/zero',
            isDir: false,
            canRead: true,
            canWrite: true,
            isAppend: false,
            cursor: 0,
          });
          view.setUint32(openedFdPtr, fd, true);
          return ESUCCESS;
        }

        if (oflags & O_DIRECTORY) {
          if (this.vfsAdapter.isDir(fullPath)) {
            const fd = this.allocateFd();
            this._openEntry({
              fd,
              path: fullPath,
              isDir: true,
              canRead: true,
              canWrite: false,
              isAppend: false,
              cursor: 0,
            });
            view.setUint32(openedFdPtr, fd, true);
            return ESUCCESS;
          }
          return this.vfsAdapter.exists(fullPath) ? ENOTDIR : ENOENT;
        }

        const rightsBig = typeof fsRightsBase === 'bigint' ? fsRightsBase : BigInt(fsRightsBase || 0);
        const canRead = rightsBig === 0n || (rightsBig & RIGHT_FD_READ) !== 0n;
        const canWrite =
          rightsBig === 0n
            ? Boolean((oflags & (O_CREAT | O_TRUNC)) || (fdflags & FDFLAG_APPEND))
            : (rightsBig & RIGHT_FD_WRITE) !== 0n;
        const isAppend = (fdflags & FDFLAG_APPEND) !== 0;

        const isReadOnly = this.vfsAdapter.isReadOnly(fullPath);
        if (isReadOnly && ((oflags & (O_CREAT | O_TRUNC)) !== 0 || isAppend || canWrite)) {
          return EROFS;
        }

        if (this.vfsAdapter.isDir(fullPath)) {
          return EISDIR;
        }

        const exists = this.vfsAdapter.exists(fullPath);
        if (exists) {
          if ((oflags & O_CREAT) && (oflags & O_EXCL)) {
            return EEXIST;
          }
          if (oflags & O_TRUNC) {
            this._writeFileAndTrack(fullPath, new Uint8Array(0));
          }
        } else {
          if (!(oflags & O_CREAT)) {
            return ENOENT;
          }
          this._writeFileAndTrack(fullPath, new Uint8Array(0));
        }

        const curData = this.vfsAdapter.readFile(fullPath);
        const fd = this.allocateFd();
        this._openEntry({
          fd,
          path: fullPath,
          isDir: false,
          canRead,
          canWrite,
          isAppend,
          cursor: isAppend ? curData.length : 0,
        });

        view.setUint32(openedFdPtr, fd, true);
        return ESUCCESS;
      },

      fd_close: (fd) => {
        if (fd >= 0 && fd <= 2) return ESUCCESS;
        this._reservedFds.delete(fd);
        if (!this.openFiles.has(fd)) return EBADF;
        this.openFiles.delete(fd);
        return ESUCCESS;
      },

      fd_read: (fd, iovsPtr, iovsLen, nreadOut) => {
        const view = this.memView();
        const file = this.openFiles.get(fd);
        if (file && file.isStdio) {
          if (typeof this.stdin === 'function') {
            return this.stdin(iovsPtr, iovsLen, nreadOut, this);
          }
          if (this.stdin instanceof Uint8Array || Array.isArray(this.stdin)) {
            const preloaded = this.stdin instanceof Uint8Array ? this.stdin : new Uint8Array(this.stdin);
            const iovecs = this._readIovecs(view, iovsPtr, iovsLen);
            let totalRead = 0;
            for (const { ptr, len } of iovecs) {
              if (len <= 0) continue;
              const available = preloaded.length - this.stdinPos;
              if (available <= 0) break;
              const toCopy = Math.min(len, available);
              this.memU8().set(preloaded.subarray(this.stdinPos, this.stdinPos + toCopy), ptr);
              this.stdinPos += toCopy;
              totalRead += toCopy;
              if (toCopy < len) break;
            }
            view.setUint32(nreadOut, totalRead, true);
            return ESUCCESS;
          }
          view.setUint32(nreadOut, 0, true);
          return ESUCCESS;
        }

        if (!file || file.isDir || !file.canRead) return EBADF;

        if (file.isDevNull) {
          view.setUint32(nreadOut, 0, true);
          return ESUCCESS;
        }

        const iovecs = this._readIovecs(view, iovsPtr, iovsLen);
        if (file.isDevZero) {
          let totalRead = 0;
          const u8 = this.memU8();
          for (const { ptr, len } of iovecs) {
            if (len <= 0) continue;
            u8.fill(0, ptr, ptr + len);
            totalRead += len;
          }
          view.setUint32(nreadOut, totalRead, true);
          return ESUCCESS;
        }

        const data = this.vfsAdapter.readFile(file.path);
        const u8 = this.memU8();
        let totalRead = 0;

        for (const { ptr, len } of iovecs) {
          if (len <= 0) continue;
          const available = Math.max(0, data.length - file.cursor);
          if (available === 0) break;
          const toCopy = Math.min(len, available);
          u8.set(data.subarray(file.cursor, file.cursor + toCopy), ptr);
          file.cursor += toCopy;
          totalRead += toCopy;
          if (toCopy < len) break;
        }

        view.setUint32(nreadOut, totalRead, true);
        return ESUCCESS;
      },

      fd_pread: (fd, iovsPtr, iovsLen, offset, nreadOut) => {
        const view = this.memView();
        const file = this.openFiles.get(fd);
        if (!file || file.isDir || !file.canRead) return EBADF;

        if (file.isDevNull) {
          view.setUint32(nreadOut, 0, true);
          return ESUCCESS;
        }

        const iovecs = this._readIovecs(view, iovsPtr, iovsLen);
        const u8 = this.memU8();

        if (file.isDevZero) {
          let totalRead = 0;
          for (const { ptr, len } of iovecs) {
            if (len <= 0) continue;
            u8.fill(0, ptr, ptr + len);
            totalRead += len;
          }
          view.setUint32(nreadOut, totalRead, true);
          return ESUCCESS;
        }

        const data = this.vfsAdapter.readFile(file.path);
        let pos = Number(offset);
        if (pos < 0) return EINVAL;
        let totalRead = 0;

        for (const { ptr, len } of iovecs) {
          if (len <= 0) continue;
          const available = Math.max(0, data.length - pos);
          if (available === 0) break;
          const toCopy = Math.min(len, available);
          u8.set(data.subarray(pos, pos + toCopy), ptr);
          pos += toCopy;
          totalRead += toCopy;
          if (toCopy < len) break;
        }

        view.setUint32(nreadOut, totalRead, true);
        return ESUCCESS;
      },

      fd_write: (fd, iovsPtr, iovsLen, nwrittenOut) => {
        const view = this.memView();
        const file = this.openFiles.get(fd);
        const iovecs = this._readIovecs(view, iovsPtr, iovsLen);

        if (file && file.isStdio) {
          let totalWritten = 0;
          let text = '';
          for (const { ptr, len } of iovecs) {
            if (len > 0) {
              text += this.readStr(ptr, len);
              totalWritten += len;
            }
          }
          view.setUint32(nwrittenOut, totalWritten, true);
          if (fd === 1 || file.fd === 1) this.stdout(text);
          else this.stderr(text);
          return ESUCCESS;
        }

        if (!file || file.isDir || !file.canWrite) return EBADF;

        if (file.isCharDev) {
          let totalWritten = 0;
          for (const { len } of iovecs) {
            if (len > 0) totalWritten += len;
          }
          view.setUint32(nwrittenOut, totalWritten, true);
          return ESUCCESS;
        }

        if (this.vfsAdapter.isReadOnly(file.path)) return EROFS;

        let data = this.vfsAdapter.readFile(file.path);
        const u8 = this.memU8();
        let totalWritten = 0;

        for (const { ptr, len } of iovecs) {
          if (len <= 0) continue;
          if (file.isAppend) {
            file.cursor = data.length;
          }
          const needed = file.cursor + len;
          if (needed > data.length) {
            const nextData = new Uint8Array(needed);
            nextData.set(data);
            data = nextData;
          }
          data.set(u8.subarray(ptr, ptr + len), file.cursor);
          file.cursor += len;
          totalWritten += len;
        }

        this._writeFileAndTrack(file.path, data);
        view.setUint32(nwrittenOut, totalWritten, true);
        return ESUCCESS;
      },

      fd_pwrite: (fd, iovsPtr, iovsLen, offset, nwrittenOut) => {
        const view = this.memView();
        const file = this.openFiles.get(fd);
        if (!file || file.isDir || !file.canWrite) return EBADF;

        const iovecs = this._readIovecs(view, iovsPtr, iovsLen);
        if (file.isCharDev) {
          let totalWritten = 0;
          for (const { len } of iovecs) {
            if (len > 0) totalWritten += len;
          }
          view.setUint32(nwrittenOut, totalWritten, true);
          return ESUCCESS;
        }

        if (this.vfsAdapter.isReadOnly(file.path)) return EROFS;

        let pos = Number(offset);
        if (pos < 0) return EINVAL;

        let data = this.vfsAdapter.readFile(file.path);
        const u8 = this.memU8();
        let totalWritten = 0;

        for (const { ptr, len } of iovecs) {
          if (len <= 0) continue;
          const needed = pos + len;
          if (needed > data.length) {
            const nextData = new Uint8Array(needed);
            nextData.set(data);
            data = nextData;
          }
          data.set(u8.subarray(ptr, ptr + len), pos);
          pos += len;
          totalWritten += len;
        }

        this._writeFileAndTrack(file.path, data);
        view.setUint32(nwrittenOut, totalWritten, true);
        return ESUCCESS;
      },

      fd_seek: (fd, offset, whence, newoffsetOut) => {
        if (fd === 0 || fd === 1 || fd === 2) return ESUCCESS;
        const file = this.openFiles.get(fd);
        if (!file || file.isDir) return EBADF;

        const view = this.memView();
        if (file.isCharDev) {
          view.setBigUint64(newoffsetOut, 0n, true);
          return ESUCCESS;
        }

        const data = this.vfsAdapter.readFile(file.path);
        const offNum = Number(offset);
        let target = file.cursor;

        if (whence === WHENCE_SET) target = offNum;
        else if (whence === WHENCE_CUR) target = file.cursor + offNum;
        else if (whence === WHENCE_END) target = data.length + offNum;
        else return EINVAL;

        if (target < 0) return EINVAL;

        file.cursor = target;
        view.setBigUint64(newoffsetOut, BigInt(file.cursor), true);
        return ESUCCESS;
      },

      fd_tell: (fd, offsetOut) => {
        const file = this.openFiles.get(fd);
        if (!file || file.isDir) return EBADF;
        const view = this.memView();
        view.setBigUint64(offsetOut, file.isCharDev ? 0n : BigInt(file.cursor), true);
        return ESUCCESS;
      },

      fd_sync: (fd) => {
        const file = this.openFiles.get(fd);
        if (file && !file.isCharDev && !file.isStdio && !file.isDir && this.onFileSync) {
          const data = this.vfsAdapter.readFile(file.path);
          try {
            this.onFileSync(file.path, data);
          } catch {}
        }
        return ESUCCESS;
      },

      fd_datasync: (fd) => wasi.fd_sync(fd),
      fd_allocate: () => ESUCCESS,
      fd_advise: () => ESUCCESS,

      fd_renumber: (fromFd, toFd) => {
        if (!this.openFiles.has(fromFd)) return EBADF;
        if (fromFd === toFd) return ESUCCESS;
        if (this.openFiles.has(toFd)) {
          wasi.fd_close(toFd);
        }
        const entry = this.openFiles.get(fromFd);
        this.openFiles.delete(fromFd);
        this._openEntry({ ...entry, fd: toFd });
        return ESUCCESS;
      },

      fd_readdir: (fd, buf, bufLen, cookie, nwrittenOut) => {
        let dirPath = null;
        const preopen = this._getPreopen(fd);
        if (preopen) {
          dirPath = preopen.path;
        } else {
          const entry = this.openFiles.get(fd);
          if (entry && entry.isDir) {
            dirPath = entry.path;
          }
        }
        if (!dirPath) return EBADF;

        const entries = this._readDirWithDevices(dirPath);
        const cookieIndex = Number(cookie);
        const view = this.memView();
        const u8 = this.memU8();
        let written = 0;

        for (let i = cookieIndex; i < entries.length; i++) {
          const entry = entries[i];
          const nameBytes = wasiCoreTextEncoder.encode(entry.name);
          const entryLen = 24 + nameBytes.length;
          if (written + entryLen > bufLen) break;

          const base = buf + written;
          u8.fill(0, base, base + 24);
          view.setBigUint64(base, BigInt(i + 1), true); // d_next
          const childPath = dirPath === '/' ? `/${entry.name}` : `${dirPath}/${entry.name}`;
          view.setBigUint64(base + 8, this._getInode(childPath), true); // d_ino
          view.setUint32(base + 16, nameBytes.length, true); // d_namlen
          const dType = entry.isCharDev
            ? FILETYPE_CHARACTER_DEVICE
            : entry.isDir
              ? FILETYPE_DIRECTORY
              : FILETYPE_REGULAR_FILE;
          view.setUint8(base + 20, dType); // d_type

          u8.set(nameBytes, base + 24);
          written += entryLen;
        }

        view.setUint32(nwrittenOut, written, true);
        return ESUCCESS;
      },

      path_unlink_file: (dirfd, pathPtr, pathLen) => {
        const pathStr = this.readStr(pathPtr, pathLen);
        const fullPath = this.resolvePath(dirfd, pathStr);
        if (this.vfsAdapter.isReadOnly(fullPath)) return EROFS;
        if (this.vfsAdapter.isDir(fullPath)) return EISDIR;
        if (!this.vfsAdapter.exists(fullPath)) return ENOENT;
        try {
          this._removeFileAndTrack(fullPath);
          return ESUCCESS;
        } catch (err) {
          return VfsAdapter.mapErrorToErrno(err, EPERM);
        }
      },

      path_remove_directory: (dirfd, pathPtr, pathLen) => {
        const pathStr = this.readStr(pathPtr, pathLen);
        const fullPath = this.resolvePath(dirfd, pathStr);
        if (this.vfsAdapter.isReadOnly(fullPath)) return EROFS;
        if (!this.vfsAdapter.isDir(fullPath)) {
          return this.vfsAdapter.exists(fullPath) ? ENOTDIR : ENOENT;
        }
        try {
          this.vfsAdapter.removeDir(fullPath);
          this.deletedFiles.add(fullPath);
          if (this.onFileDelete) {
            try {
              this.onFileDelete(fullPath);
            } catch {}
          }
          return ESUCCESS;
        } catch (err) {
          return VfsAdapter.mapErrorToErrno(err, EPERM);
        }
      },

      path_create_directory: (dirfd, pathPtr, pathLen) => {
        const pathStr = this.readStr(pathPtr, pathLen);
        const fullPath = this.resolvePath(dirfd, pathStr);
        if (this.vfsAdapter.isReadOnly(fullPath)) return EROFS;
        if (this.vfsAdapter.exists(fullPath) || this.vfsAdapter.isDir(fullPath)) {
          return EEXIST;
        }
        try {
          this.vfsAdapter.mkdir(fullPath, false);
          return ESUCCESS;
        } catch (err) {
          return VfsAdapter.mapErrorToErrno(err, EPERM);
        }
      },

      path_rename: (oldDirfd, oldPathPtr, oldPathLen, newDirfd, newPathPtr, newPathLen) => {
        const oldStr = this.readStr(oldPathPtr, oldPathLen);
        const newStr = this.readStr(newPathPtr, newPathLen);
        const oldFull = this.resolvePath(oldDirfd, oldStr);
        const newFull = this.resolvePath(newDirfd, newStr);

        if (this.vfsAdapter.isReadOnly(oldFull) || this.vfsAdapter.isReadOnly(newFull)) {
          return EROFS;
        }
        if (!this.vfsAdapter.exists(oldFull) && !this.vfsAdapter.isDir(oldFull)) {
          return ENOENT;
        }

        try {
          const wasDir = this.vfsAdapter.isDir(oldFull);
          this.vfsAdapter.rename(oldFull, newFull);
          this.deletedFiles.add(oldFull);
          this.changedFiles.delete(oldFull);
          if (this.onFileDelete) {
            try {
              this.onFileDelete(oldFull);
            } catch {}
          }
          if (!wasDir && this.vfsAdapter.exists(newFull)) {
            const bytes = this.vfsAdapter.readFile(newFull);
            this.changedFiles.set(newFull, bytes);
            if (this.onFileSync) {
              try {
                this.onFileSync(newFull, bytes);
              } catch {}
            }
          }
          return ESUCCESS;
        } catch (err) {
          return VfsAdapter.mapErrorToErrno(err, EEXIST);
        }
      },

      path_readlink: () => ENOSYS,
      path_symlink: () => ENOSYS,
      path_link: () => ENOSYS,

      environ_sizes_get: (countOut, sizeOut) => {
        const view = this.memView();
        const keys = Object.keys(this.environ);
        let totalBytes = 0;
        for (const k of keys) {
          totalBytes += wasiCoreTextEncoder.encode(`${k}=${this.environ[k]}`).length + 1;
        }
        view.setUint32(countOut, keys.length, true);
        view.setUint32(sizeOut, totalBytes, true);
        return ESUCCESS;
      },

      environ_get: (ptrs, buf) => {
        const view = this.memView();
        const u8 = this.memU8();
        const keys = Object.keys(this.environ);
        let b = buf;
        let p = ptrs;
        for (const k of keys) {
          view.setUint32(p, b, true);
          p += 4;
          const bytes = wasiCoreTextEncoder.encode(`${k}=${this.environ[k]}`);
          u8.set(bytes, b);
          b += bytes.length;
          u8[b++] = 0;
        }
        return ESUCCESS;
      },

      args_sizes_get: (argcOut, sizeOut) => {
        const view = this.memView();
        let totalBytes = 0;
        for (const arg of this.argv) {
          totalBytes += wasiCoreTextEncoder.encode(String(arg)).length + 1;
        }
        view.setUint32(argcOut, this.argv.length, true);
        view.setUint32(sizeOut, totalBytes, true);
        return ESUCCESS;
      },

      args_get: (ptrs, buf) => {
        const view = this.memView();
        const u8 = this.memU8();
        let b = buf;
        let p = ptrs;
        for (const arg of this.argv) {
          view.setUint32(p, b, true);
          p += 4;
          const bytes = wasiCoreTextEncoder.encode(String(arg));
          u8.set(bytes, b);
          b += bytes.length;
          u8[b++] = 0;
        }
        return ESUCCESS;
      },

      clock_time_get: (clockId, precision, timeOut) => {
        const view = this.memView();
        let nowNs;
        if (clockId === CLOCKID_MONOTONIC && typeof performance !== 'undefined' && typeof performance.now === 'function') {
          nowNs = BigInt(Math.floor(performance.now() * 1e6));
        } else {
          nowNs = BigInt(Date.now()) * 1000000n;
        }
        view.setBigUint64(timeOut, nowNs, true);
        return ESUCCESS;
      },

      clock_res_get: (_clockId, resOut) => {
        this.memView().setBigUint64(resOut, 1000n, true);
        return ESUCCESS;
      },

      random_get: (buf, len) => {
        const u8 = this.memU8();
        const isShared = WASI_HAS_SAB && u8.buffer instanceof SharedArrayBuffer;
        const CHUNK = 65536;
        let offset = 0;
        while (offset < len) {
          const size = Math.min(CHUNK, len - offset);
          if (isShared) {
            const tmp = new Uint8Array(size);
            crypto.getRandomValues(tmp);
            u8.set(tmp, buf + offset);
          } else {
            crypto.getRandomValues(u8.subarray(buf + offset, buf + offset + size));
          }
          offset += size;
        }
        return ESUCCESS;
      },

      poll_oneoff: (inPtr, outPtr, nsubscriptions, neventsOut) => {
        const view = this.memView();
        let nevents = 0;
        let maxSleepMs = 0;

        for (let i = 0; i < nsubscriptions; i++) {
          const subPtr = inPtr + i * 48;
          const userdata = view.getBigUint64(subPtr, true);
          const tag = view.getUint8(subPtr + 8);

          if (tag === EVENTTYPE_CLOCK) {
            const timeout = view.getBigUint64(subPtr + 24, true);
            const flags = view.getUint16(subPtr + 40, true);

            let waitMs = 0;
            if ((flags & SUBCLOCKFLAGS_ABSTIME) !== 0) {
              const nowNs = BigInt(Date.now()) * 1000000n;
              if (timeout > nowNs) {
                waitMs = Number((timeout - nowNs) / 1000000n);
              }
            } else {
              waitMs = Number(timeout / 1000000n);
            }
            if (waitMs > maxSleepMs) maxSleepMs = waitMs;

            const evtPtr = outPtr + nevents * 32;
            view.setBigUint64(evtPtr, userdata, true);
            view.setUint16(evtPtr + 8, ESUCCESS, true);
            view.setUint8(evtPtr + 10, EVENTTYPE_CLOCK);
            nevents++;
          } else {
            const evtPtr = outPtr + nevents * 32;
            view.setBigUint64(evtPtr, userdata, true);
            view.setUint16(evtPtr + 8, ESUCCESS, true);
            view.setUint8(evtPtr + 10, tag);
            nevents++;
          }
        }

        if (maxSleepMs > 0) {
          const clampedMs = Math.max(1, Math.min(maxSleepMs, 60000));
          let slept = false;
          if (WASI_HAS_SAB) {
            try {
              if (!this._sleepSyncBuffer) {
                this._sleepSyncBuffer = new Int32Array(new SharedArrayBuffer(4));
              }
              Atomics.wait(this._sleepSyncBuffer, 0, 0, clampedMs);
              slept = true;
            } catch {}
          }
          if (!slept) {
            // Bounded busy-wait fallback for non-isolated or main-thread contexts
            const fallbackMs = Math.min(clampedMs, 50);
            const start = Date.now();
            while (Date.now() - start < fallbackMs) {}
          }
        }

        view.setUint32(neventsOut, nevents, true);
        return ESUCCESS;
      },

      sched_yield: () => ESUCCESS,
    };

    if (this.customFsImports && typeof this.customFsImports === 'object') {
      Object.assign(wasi, this.customFsImports);
    }

    const wrapped = typeof this.wasiWrapper === 'function' ? this.wasiWrapper(wasi, this) : wasi;
    const fallbackCode = this.strictStubs ? ENOSYS : ESUCCESS;

    return new Proxy(wrapped, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return () => fallbackCode;
      },
    });
  }

  /**
   * Builds the full WebAssembly import object `{ wasi_snapshot_preview1, wasi_unstable, env }`.
   * @param {Record<string, Function>} [customEnv={}]
   * @returns {{ wasi_snapshot_preview1: object, wasi_unstable: object, env: object }}
   */
  createImportObject(customEnv = {}) {
    const wasi = this.getImports();
    const providerEnv = typeof this.envProvider === 'function' ? (this.envProvider(this) || {}) : {};
    const mergedEnv = {
      ...providerEnv,
      ...(customEnv || {}),
    };

    return {
      wasi_snapshot_preview1: wasi,
      wasi_unstable: wasi,
      env: new Proxy(mergedEnv, {
        get(target, prop) {
          if (prop in target) return target[prop];
          return () => 0;
        },
      }),
    };
  }

  /**
   * Alias for `createImportObject()` for WASI API symmetry.
   * @param {Record<string, Function>} [customEnv={}]
   */
  getImportObject(customEnv = {}) {
    return this.createImportObject(customEnv);
  }
}


// gl-context.js - WebGL ES 2.0 Host State Machine and Handle Table

function createGLImports(gl, getMemory) {
  const buffers = new Map();
  const textures = new Map();
  const shaders = new Map();
  const programs = new Map();
  const framebuffers = new Map();
  const renderbuffers = new Map();
  const uniformLocations = new Map();

  let nextBufferId = 1;
  let nextTextureId = 1;
  let nextShaderId = 1;
  let nextProgramId = 1;
  let nextFramebufferId = 1;
  let nextRenderbufferId = 1;
  let nextUniformLocId = 1;

  const utf8Decoder = new TextDecoder('utf-8');
  const utf8Encoder = new TextEncoder();

  function getString(ptr, len) {
    if (ptr === 0) return '';
    const mem = getMemory();
    if (len >= 0) {
      return utf8Decoder.decode(new Uint8Array(mem.buffer, ptr, len));
    }
    // Null-terminated string
    const u8 = new Uint8Array(mem.buffer, ptr);
    let end = 0;
    while (u8[end] !== 0) end++;
    return utf8Decoder.decode(new Uint8Array(mem.buffer, ptr, end));
  }

  function writeString(str, bufPtr, maxLen) {
    if (bufPtr === 0 || maxLen <= 0) return 0;
    const mem = getMemory();
    const encoded = utf8Encoder.encode(str);
    const writeLen = Math.min(encoded.length, maxLen - 1);
    const dest = new Uint8Array(mem.buffer, bufPtr, maxLen);
    dest.set(encoded.subarray(0, writeLen));
    dest[writeLen] = 0;
    return writeLen;
  }

  function getBytesPerPixel(format, type) {
    // 0x1406 = FLOAT
    // 0x1401 = UNSIGNED_BYTE
    // 0x8363 = UNSIGNED_SHORT_5_6_5
    // 0x8033 = UNSIGNED_SHORT_4_4_4_4
    // 0x8034 = UNSIGNED_SHORT_5_5_5_1
    let channels = 4;
    switch (format) {
      case 0x1906: channels = 1; break; // ALPHA
      case 0x1909: channels = 1; break; // LUMINANCE
      case 0x190A: channels = 2; break; // LUMINANCE_ALPHA
      case 0x1907: channels = 3; break; // RGB
      case 0x1908: channels = 4; break; // RGBA
      case 0x1902: channels = 1; break; // DEPTH_COMPONENT
    }

    if (type === 0x1406) return channels * 4; // FLOAT
    if (type === 0x8363 || type === 0x8033 || type === 0x8034 || type === 0x1403) return 2; // UNSIGNED_SHORT
    return channels; // UNSIGNED_BYTE
  }

  // Extensions query
  let anisoExt = null;
  if (gl && gl.getExtension) {
    anisoExt = gl.getExtension('EXT_texture_filter_anisotropic') ||
               gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') ||
               gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
    gl.getExtension('OES_texture_float');
    gl.getExtension('OES_texture_half_float');
    gl.getExtension('OES_element_index_uint');
    gl.getExtension('OES_standard_derivatives');
  }

  return {
    // Scalar & State
    glViewport: (x, y, w, h) => gl.viewport(x, y, w, h),
    glClear: (mask) => gl.clear(mask),
    glClearColor: (r, g, b, a) => gl.clearColor(r, g, b, a),
    glClearDepthf: (d) => gl.clearDepth(d),
    glClearStencil: (s) => gl.clearStencil(s),
    glColorMask: (r, g, b, a) => gl.colorMask(!!r, !!g, !!b, !!a),
    glDepthMask: (flag) => gl.depthMask(!!flag),
    glDepthFunc: (func) => gl.depthFunc(func),
    glDepthRangef: (n, f) => gl.depthRange(n, f),
    glCullFace: (mode) => gl.cullFace(mode),
    glFrontFace: (mode) => gl.frontFace(mode),
    glEnable: (cap) => gl.enable(cap),
    glDisable: (cap) => gl.disable(cap),
    glBlendFunc: (s, d) => gl.blendFunc(s, d),
    glBlendFuncSeparate: (sRGB, dRGB, sA, dA) => gl.blendFuncSeparate(sRGB, dRGB, sA, dA),
    glBlendEquation: (mode) => gl.blendEquation(mode),
    glBlendEquationSeparate: (modeRGB, modeA) => gl.blendEquationSeparate(modeRGB, modeA),
    glBlendColor: (r, g, b, a) => gl.blendColor(r, g, b, a),
    glLineWidth: (w) => gl.lineWidth(w),
    glPolygonOffset: (factor, units) => gl.polygonOffset(factor, units),
    glScissor: (x, y, w, h) => gl.scissor(x, y, w, h),
    glSampleCoverage: (value, invert) => gl.sampleCoverage(value, !!invert),
    glHint: (target, mode) => gl.hint(target, mode),
    glPixelStorei: (pname, param) => gl.pixelStorei(pname, param),
    glFlush: () => gl.flush(),
    glFinish: () => gl.finish(),
    glGetError: () => gl.getError(),

    // Buffer management
    glGenBuffers: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = nextBufferId++;
        buffers.set(id, gl.createBuffer());
        u32[i] = id;
      }
    },
    glDeleteBuffers: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = u32[i];
        const buf = buffers.get(id);
        if (buf) {
          gl.deleteBuffer(buf);
          buffers.delete(id);
        }
      }
    },
    glBindBuffer: (target, id) => {
      gl.bindBuffer(target, id ? buffers.get(id) || null : null);
    },
    glBufferData: (target, size, dataPtr, usage) => {
      if (dataPtr === 0) {
        gl.bufferData(target, size, usage);
      } else {
        const mem = getMemory();
        const data = new Uint8Array(mem.buffer, dataPtr, size);
        gl.bufferData(target, data, usage);
      }
    },
    glBufferSubData: (target, offset, size, dataPtr) => {
      const mem = getMemory();
      const data = new Uint8Array(mem.buffer, dataPtr, size);
      gl.bufferSubData(target, offset, data);
    },

    // Texture management
    glGenTextures: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = nextTextureId++;
        textures.set(id, gl.createTexture());
        u32[i] = id;
      }
    },
    glDeleteTextures: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = u32[i];
        const tex = textures.get(id);
        if (tex) {
          gl.deleteTexture(tex);
          textures.delete(id);
        }
      }
    },
    glBindTexture: (target, id) => {
      gl.bindTexture(target, id ? textures.get(id) || null : null);
    },
    glActiveTexture: (texture) => gl.activeTexture(texture),
    glTexParameteri: (target, pname, param) => gl.texParameteri(target, pname, param),
    glTexParameterf: (target, pname, param) => gl.texParameterf(target, pname, param),
    glTexParameteriv: (target, pname, ptr) => {
      const mem = getMemory();
      gl.texParameteri(target, pname, new Int32Array(mem.buffer, ptr, 1)[0]);
    },
    glTexParameterfv: (target, pname, ptr) => {
      const mem = getMemory();
      gl.texParameterf(target, pname, new Float32Array(mem.buffer, ptr, 1)[0]);
    },
    glGenerateMipmap: (target) => gl.generateMipmap(target),
    glTexImage2D: (target, level, internalformat, width, height, border, format, type, pixelsPtr) => {
      if (pixelsPtr === 0) {
        gl.texImage2D(target, level, internalformat, width, height, border, format, type, null);
      } else {
        const mem = getMemory();
        const bpp = getBytesPerPixel(format, type);
        const byteLen = width * height * bpp;
        const data = new Uint8Array(mem.buffer, pixelsPtr, byteLen);
        gl.texImage2D(target, level, internalformat, width, height, border, format, type, data);
      }
    },
    glTexSubImage2D: (target, level, xoffset, yoffset, width, height, format, type, pixelsPtr) => {
      const mem = getMemory();
      const bpp = getBytesPerPixel(format, type);
      const byteLen = width * height * bpp;
      const data = new Uint8Array(mem.buffer, pixelsPtr, byteLen);
      gl.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, data);
    },
    glCompressedTexImage2D: (target, level, internalformat, width, height, border, imageSize, dataPtr) => {
      const mem = getMemory();
      const data = new Uint8Array(mem.buffer, dataPtr, imageSize);
      gl.compressedTexImage2D(target, level, internalformat, width, height, border, data);
    },
    glCompressedTexSubImage2D: (target, level, xoffset, yoffset, width, height, format, imageSize, dataPtr) => {
      const mem = getMemory();
      const data = new Uint8Array(mem.buffer, dataPtr, imageSize);
      gl.compressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, data);
    },
    glCopyTexImage2D: (target, level, internalformat, x, y, width, height, border) => {
      gl.copyTexImage2D(target, level, internalformat, x, y, width, height, border);
    },
    glCopyTexSubImage2D: (target, level, xoffset, yoffset, x, y, width, height) => {
      gl.copyTexSubImage2D(target, level, xoffset, yoffset, x, y, width, height);
    },

    // Shaders & Programs
    glCreateShader: (type) => {
      const id = nextShaderId++;
      shaders.set(id, gl.createShader(type));
      return id;
    },
    glDeleteShader: (id) => {
      const s = shaders.get(id);
      if (s) {
        gl.deleteShader(s);
        shaders.delete(id);
      }
    },
    glCompileShader: (id) => {
      const s = shaders.get(id);
      if (s) gl.compileShader(s);
    },
    glGetShaderiv: (id, pname, paramsPtr) => {
      const s = shaders.get(id);
      const mem = getMemory();
      const out = new Int32Array(mem.buffer, paramsPtr, 1);
      if (!s) { out[0] = 0; return; }
      if (pname === 0x8B84) { // GL_INFO_LOG_LENGTH
        const log = gl.getShaderInfoLog(s) || '';
        out[0] = log.length > 0 ? log.length + 1 : 0;
      } else {
        const val = gl.getShaderParameter(s, pname);
        out[0] = typeof val === 'boolean' ? (val ? 1 : 0) : (val || 0);
      }
    },
    glCreateProgram: () => {
      const id = nextProgramId++;
      programs.set(id, gl.createProgram());
      return id;
    },
    glDeleteProgram: (id) => {
      const p = programs.get(id);
      if (p) {
        gl.deleteProgram(p);
        programs.delete(id);
      }
    },
    glAttachShader: (progId, shaderId) => {
      const p = programs.get(progId);
      const s = shaders.get(shaderId);
      if (p && s) gl.attachShader(p, s);
    },
    glDetachShader: (progId, shaderId) => {
      const p = programs.get(progId);
      const s = shaders.get(shaderId);
      if (p && s) gl.detachShader(p, s);
    },
    glLinkProgram: (progId) => {
      const p = programs.get(progId);
      if (p) gl.linkProgram(p);
    },
    glUseProgram: (progId) => {
      gl.useProgram(progId ? programs.get(progId) || null : null);
    },
    glValidateProgram: (progId) => {
      const p = programs.get(progId);
      if (p) gl.validateProgram(p);
    },
    glGetProgramiv: (progId, pname, paramsPtr) => {
      const p = programs.get(progId);
      const mem = getMemory();
      const out = new Int32Array(mem.buffer, paramsPtr, 1);
      if (!p) { out[0] = 0; return; }
      if (pname === 0x8B84) { // GL_INFO_LOG_LENGTH
        const log = gl.getProgramInfoLog(p) || '';
        out[0] = log.length > 0 ? log.length + 1 : 0;
      } else {
        const val = gl.getProgramParameter(p, pname);
        out[0] = typeof val === 'boolean' ? (val ? 1 : 0) : (val || 0);
      }
    },

    // Vertex Attributes
    glVertexAttribPointer: (index, size, type, normalized, stride, offset) => {
      gl.vertexAttribPointer(index, size, type, !!normalized, stride, offset);
    },
    glEnableVertexAttribArray: (index) => gl.enableVertexAttribArray(index),
    glDisableVertexAttribArray: (index) => gl.disableVertexAttribArray(index),
    glVertexAttrib1f: (index, x) => gl.vertexAttrib1f(index, x),
    glVertexAttrib2f: (index, x, y) => gl.vertexAttrib2f(index, x, y),
    glVertexAttrib3f: (index, x, y, z) => gl.vertexAttrib3f(index, x, y, z),
    glVertexAttrib4f: (index, x, y, z, w) => gl.vertexAttrib4f(index, x, y, z, w),
    glVertexAttrib1fv: (index, ptr) => {
      const mem = getMemory();
      gl.vertexAttrib1fv(index, new Float32Array(mem.buffer, ptr, 1));
    },
    glVertexAttrib2fv: (index, ptr) => {
      const mem = getMemory();
      gl.vertexAttrib2fv(index, new Float32Array(mem.buffer, ptr, 2));
    },
    glVertexAttrib3fv: (index, ptr) => {
      const mem = getMemory();
      gl.vertexAttrib3fv(index, new Float32Array(mem.buffer, ptr, 3));
    },
    glVertexAttrib4fv: (index, ptr) => {
      const mem = getMemory();
      gl.vertexAttrib4fv(index, new Float32Array(mem.buffer, ptr, 4));
    },

    // Uniforms
    glUniform1i: (locId, x) => {
      const loc = uniformLocations.get(locId);
      if (loc) gl.uniform1i(loc, x);
    },
    glUniform1f: (locId, x) => {
      const loc = uniformLocations.get(locId);
      if (loc) gl.uniform1f(loc, x);
    },
    glUniform2f: (locId, x, y) => {
      const loc = uniformLocations.get(locId);
      if (loc) gl.uniform2f(loc, x, y);
    },
    glUniform3f: (locId, x, y, z) => {
      const loc = uniformLocations.get(locId);
      if (loc) gl.uniform3f(loc, x, y, z);
    },
    glUniform4f: (locId, x, y, z, w) => {
      const loc = uniformLocations.get(locId);
      if (loc) gl.uniform4f(loc, x, y, z, w);
    },
    glUniform1iv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform1iv(loc, new Int32Array(mem.buffer, ptr, count));
      }
    },
    glUniform2iv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform2iv(loc, new Int32Array(mem.buffer, ptr, count * 2));
      }
    },
    glUniform3iv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform3iv(loc, new Int32Array(mem.buffer, ptr, count * 3));
      }
    },
    glUniform4iv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform4iv(loc, new Int32Array(mem.buffer, ptr, count * 4));
      }
    },
    glUniform1fv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform1fv(loc, new Float32Array(mem.buffer, ptr, count));
      }
    },
    glUniform2fv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform2fv(loc, new Float32Array(mem.buffer, ptr, count * 2));
      }
    },
    glUniform3fv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform3fv(loc, new Float32Array(mem.buffer, ptr, count * 3));
      }
    },
    glUniform4fv: (locId, count, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniform4fv(loc, new Float32Array(mem.buffer, ptr, count * 4));
      }
    },
    glUniformMatrix2fv: (locId, count, transpose, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniformMatrix2fv(loc, !!transpose, new Float32Array(mem.buffer, ptr, count * 4));
      }
    },
    glUniformMatrix3fv: (locId, count, transpose, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniformMatrix3fv(loc, !!transpose, new Float32Array(mem.buffer, ptr, count * 9));
      }
    },
    glUniformMatrix4fv: (locId, count, transpose, ptr) => {
      const loc = uniformLocations.get(locId);
      if (loc) {
        const mem = getMemory();
        gl.uniformMatrix4fv(loc, !!transpose, new Float32Array(mem.buffer, ptr, count * 16));
      }
    },

    // Drawing
    glDrawArrays: (mode, first, count) => gl.drawArrays(mode, first, count),
    glDrawElements: (mode, count, type, indicesOffset) => gl.drawElements(mode, count, type, indicesOffset),

    // Framebuffer & Renderbuffer
    glGenFramebuffers: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = nextFramebufferId++;
        framebuffers.set(id, gl.createFramebuffer());
        u32[i] = id;
      }
    },
    glDeleteFramebuffers: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = u32[i];
        const fb = framebuffers.get(id);
        if (fb) {
          gl.deleteFramebuffer(fb);
          framebuffers.delete(id);
        }
      }
    },
    glBindFramebuffer: (target, id) => {
      gl.bindFramebuffer(target, id ? framebuffers.get(id) || null : null);
    },
    glCheckFramebufferStatus: (target) => gl.checkFramebufferStatus(target),
    glFramebufferTexture2D: (target, attachment, textarget, texId, level) => {
      gl.framebufferTexture2D(target, attachment, textarget, textures.get(texId) || null, level);
    },
    glFramebufferRenderbuffer: (target, attachment, rbTarget, rbId) => {
      gl.framebufferRenderbuffer(target, attachment, rbTarget, renderbuffers.get(rbId) || null);
    },
    glGenRenderbuffers: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = nextRenderbufferId++;
        renderbuffers.set(id, gl.createRenderbuffer());
        u32[i] = id;
      }
    },
    glDeleteRenderbuffers: (n, ptr) => {
      const mem = getMemory();
      const u32 = new Uint32Array(mem.buffer, ptr, n);
      for (let i = 0; i < n; i++) {
        const id = u32[i];
        const rb = renderbuffers.get(id);
        if (rb) {
          gl.deleteRenderbuffer(rb);
          renderbuffers.delete(id);
        }
      }
    },
    glBindRenderbuffer: (target, id) => {
      gl.bindRenderbuffer(target, id ? renderbuffers.get(id) || null : null);
    },
    glRenderbufferStorage: (target, internalformat, width, height) => {
      gl.renderbufferStorage(target, internalformat, width, height);
    },
    glGetFramebufferAttachmentParameteriv: (target, attachment, pname, paramsPtr) => {
      const val = gl.getFramebufferAttachmentParameter(target, attachment, pname);
      const mem = getMemory();
      new Int32Array(mem.buffer, paramsPtr, 1)[0] = typeof val === 'number' ? val : 0;
    },
    glGetRenderbufferParameteriv: (target, pname, paramsPtr) => {
      const val = gl.getRenderbufferParameter(target, pname);
      const mem = getMemory();
      new Int32Array(mem.buffer, paramsPtr, 1)[0] = typeof val === 'number' ? val : 0;
    },

    // Queries
    glGetIntegerv: (pname, paramsPtr) => {
      const mem = getMemory();
      const out = new Int32Array(mem.buffer, paramsPtr, 4);
      switch (pname) {
        case 0x0D33: // GL_MAX_TEXTURE_SIZE
          out[0] = gl.getParameter(pname) || 2048;
          break;
        case 0x8872: // GL_MAX_TEXTURE_IMAGE_UNITS
          out[0] = gl.getParameter(pname) || 8;
          break;
        case 0x8869: // GL_MAX_VERTEX_ATTRIBS
          out[0] = gl.getParameter(pname) || 8;
          break;
        case 0x851C: // GL_MAX_CUBE_MAP_TEXTURE_SIZE
          out[0] = gl.getParameter(pname) || 2048;
          break;
        case 0x0BA2: { // GL_VIEWPORT
          const vp = gl.getParameter(pname);
          if (vp) {
            out[0] = vp[0]; out[1] = vp[1]; out[2] = vp[2]; out[3] = vp[3];
          }
          break;
        }
        case 0x86A2: // GL_NUM_COMPRESSED_TEXTURE_FORMATS
          out[0] = 0;
          break;
        default: {
          const val = gl.getParameter(pname);
          out[0] = typeof val === 'number' ? val : 0;
          break;
        }
      }
    },
    glGetFloatv: (pname, paramsPtr) => {
      const mem = getMemory();
      const out = new Float32Array(mem.buffer, paramsPtr, 1);
      if (pname === 0x84FF) { // GL_MAX_TEXTURE_MAX_ANISOTROPY_EXT
        if (anisoExt) {
          out[0] = gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1.0;
        } else {
          out[0] = 1.0;
        }
      } else {
        const val = gl.getParameter(pname);
        out[0] = typeof val === 'number' ? val : 0.0;
      }
    },
    glGetBooleanv: (pname, paramsPtr) => {
      const mem = getMemory();
      const val = gl.getParameter(pname);
      new Uint8Array(mem.buffer, paramsPtr, 1)[0] = val ? 1 : 0;
    },
    glGetBufferParameteriv: (target, pname, paramsPtr) => {
      const val = gl.getBufferParameter(target, pname);
      const mem = getMemory();
      new Int32Array(mem.buffer, paramsPtr, 1)[0] = typeof val === 'number' ? val : 0;
    },
    glReadPixels: (x, y, w, h, format, type, pixelsPtr) => {
      const mem = getMemory();
      const bpp = getBytesPerPixel(format, type);
      const data = new Uint8Array(mem.buffer, pixelsPtr, w * h * bpp);
      gl.readPixels(x, y, w, h, format, type, data);
    },

    // C Wrappers raw host imports
    gl_host_get_string: (name, bufPtr, maxLen) => {
      let str = '';
      switch (name) {
        case 0x1F00: str = 'WebKit / WebGL'; break; // GL_VENDOR
        case 0x1F01: str = 'WebGL Canvas Renderer'; break; // GL_RENDERER
        case 0x1F02: str = 'OpenGL ES 2.0 (WebGL 1.0)'; break; // GL_VERSION
        case 0x8B8C: str = 'WebGL GLSL ES 1.0'; break; // GL_SHADING_LANGUAGE_VERSION
        case 0x1F03: // GL_EXTENSIONS
          str = 'GL_OES_texture_float GL_OES_texture_half_float GL_OES_element_index_uint GL_OES_standard_derivatives';
          if (anisoExt) str += ' GL_EXT_texture_filter_anisotropic';
          break;
      }
      return writeString(str, bufPtr, maxLen);
    },
    gl_host_shader_source: (shaderId, srcPtr, len) => {
      const s = shaders.get(shaderId);
      if (!s) return;
      let source = getString(srcPtr, len);
      gl.shaderSource(s, source);
    },
    gl_host_get_shader_info_log: (shaderId, maxLen, lenPtr, bufPtr) => {
      const s = shaders.get(shaderId);
      const log = s ? (gl.getShaderInfoLog(s) || '') : '';
      const written = writeString(log, bufPtr, maxLen);
      if (lenPtr !== 0) {
        const mem = getMemory();
        new Int32Array(mem.buffer, lenPtr, 1)[0] = written;
      }
    },
    gl_host_get_program_info_log: (progId, maxLen, lenPtr, bufPtr) => {
      const p = programs.get(progId);
      const log = p ? (gl.getProgramInfoLog(p) || '') : '';
      const written = writeString(log, bufPtr, maxLen);
      if (lenPtr !== 0) {
        const mem = getMemory();
        new Int32Array(mem.buffer, lenPtr, 1)[0] = written;
      }
    },
    gl_host_get_uniform_location: (progId, namePtr, nameLen) => {
      const p = programs.get(progId);
      if (!p) return -1;
      const name = getString(namePtr, nameLen);
      const loc = gl.getUniformLocation(p, name);
      if (!loc) return -1;
      const id = nextUniformLocId++;
      uniformLocations.set(id, loc);
      return id;
    },
    gl_host_get_attrib_location: (progId, namePtr, nameLen) => {
      const p = programs.get(progId);
      if (!p) return -1;
      const name = getString(namePtr, nameLen);
      return gl.getAttribLocation ? gl.getAttribLocation(p, name) : 0;
    },
    gl_host_bind_attrib_location: (progId, index, namePtr, nameLen) => {
      const p = programs.get(progId);
      if (!p) return;
      const name = getString(namePtr, nameLen);
      if (gl.bindAttribLocation) gl.bindAttribLocation(p, index, name);
    }
  };
}

function createMockGL(stats = {}) {
  stats.clearCount = 0;
  stats.drawArraysCount = 0;
  stats.drawElementsCount = 0;
  stats.buffersCreated = 0;
  stats.texturesCreated = 0;
  stats.shadersCreated = 0;
  stats.programsCreated = 0;
  stats.uniformsSet = 0;
  stats.lastViewport = { x: 0, y: 0, width: 800, height: 450 };

  const shaderSources = new Map();
  const uniformLocations = new Map();
  let nextLocId = 1;

  return {
    stats,
    viewport: (x, y, w, h) => { stats.lastViewport = { x, y, width: w, height: h }; },
    clear: (mask) => { stats.clearCount++; },
    clearColor: () => {},
    clearDepth: () => {},
    clearStencil: () => {},
    colorMask: () => {},
    depthMask: () => {},
    depthFunc: () => {},
    depthRange: () => {},
    cullFace: () => {},
    frontFace: () => {},
    enable: () => {},
    disable: () => {},
    blendFunc: () => {},
    blendFuncSeparate: () => {},
    blendEquation: () => {},
    blendEquationSeparate: () => {},
    blendColor: () => {},
    lineWidth: () => {},
    polygonOffset: () => {},
    scissor: () => {},
    sampleCoverage: () => {},
    hint: () => {},
    pixelStorei: () => {},
    flush: () => {},
    finish: () => {},
    getError: () => 0,

    createBuffer: () => {
      stats.buffersCreated++;
      return { id: stats.buffersCreated };
    },
    deleteBuffer: () => {},
    bindBuffer: () => {},
    bufferData: () => {},
    bufferSubData: () => {},

    createTexture: () => {
      stats.texturesCreated++;
      return { id: stats.texturesCreated };
    },
    deleteTexture: () => {},
    bindTexture: () => {},
    activeTexture: () => {},
    texParameteri: () => {},
    texParameterf: () => {},
    generateMipmap: () => {},
    texImage2D: () => {},
    texSubImage2D: () => {},

    createShader: (type) => {
      stats.shadersCreated++;
      return { id: stats.shadersCreated, type };
    },
    deleteShader: () => {},
    shaderSource: (shader, source) => {
      if (shader) shaderSources.set(shader.id, source);
    },
    compileShader: () => {},
    getShaderParameter: () => 1,
    getShaderInfoLog: () => '',

    createProgram: () => {
      stats.programsCreated++;
      return { id: stats.programsCreated };
    },
    deleteProgram: () => {},
    attachShader: () => {},
    detachShader: () => {},
    linkProgram: () => {},
    useProgram: () => {},
    validateProgram: () => {},
    bindAttribLocation: () => {},
    getAttribLocation: () => 0,
    getProgramParameter: () => 1,
    getProgramInfoLog: () => '',

    vertexAttribPointer: () => {},
    enableVertexAttribArray: () => {},
    disableVertexAttribArray: () => {},
    vertexAttrib1f: () => {},
    vertexAttrib2f: () => {},
    vertexAttrib3f: () => {},
    vertexAttrib4f: () => {},

    getUniformLocation: (prog, name) => {
      const key = `${prog ? prog.id : 0}:${name}`;
      if (!uniformLocations.has(key)) {
        uniformLocations.set(key, { id: nextLocId++, name });
      }
      return uniformLocations.get(key);
    },
    uniform1i: () => { stats.uniformsSet++; },
    uniform2i: () => { stats.uniformsSet++; },
    uniform3i: () => { stats.uniformsSet++; },
    uniform4i: () => { stats.uniformsSet++; },
    uniform1iv: () => { stats.uniformsSet++; },
    uniform2iv: () => { stats.uniformsSet++; },
    uniform3iv: () => { stats.uniformsSet++; },
    uniform4iv: () => { stats.uniformsSet++; },
    uniform1f: () => { stats.uniformsSet++; },
    uniform2f: () => { stats.uniformsSet++; },
    uniform3f: () => { stats.uniformsSet++; },
    uniform4f: () => { stats.uniformsSet++; },
    uniform1fv: () => { stats.uniformsSet++; },
    uniform2fv: () => { stats.uniformsSet++; },
    uniform3fv: () => { stats.uniformsSet++; },
    uniform4fv: () => { stats.uniformsSet++; },
    uniformMatrix2fv: () => { stats.uniformsSet++; },
    uniformMatrix3fv: () => { stats.uniformsSet++; },
    uniformMatrix4fv: () => { stats.uniformsSet++; },

    drawArrays: () => { stats.drawArraysCount++; },
    drawElements: () => { stats.drawElementsCount++; },

    getParameter: (pname) => {
      if (pname === 0x0D33 || pname === 0x84E8) return 4096;
      if (pname === 0x8869) return 16;
      return 2048;
    },

    getExtension: (name) => {
      if (name.includes('anisotropic')) return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84FF };
      return {};
    }
  };
}


// canvas-wasi: Keyboard, Mouse, and Touch Input Coordinator with SharedArrayBuffer support

const DOM_KEY_MAP = {
  KeyA: 65, KeyB: 66, KeyC: 67, KeyD: 68, KeyE: 69, KeyF: 70, KeyG: 71,
  KeyH: 72, KeyI: 73, KeyJ: 74, KeyK: 75, KeyL: 76, KeyM: 77, KeyN: 78,
  KeyO: 79, KeyP: 80, KeyQ: 81, KeyR: 82, KeyS: 83, KeyT: 84, KeyU: 85,
  KeyV: 86, KeyW: 87, KeyX: 88, KeyY: 89, KeyZ: 90,

  Digit0: 48, Digit1: 49, Digit2: 50, Digit3: 51, Digit4: 52,
  Digit5: 53, Digit6: 54, Digit7: 55, Digit8: 56, Digit9: 57,

  Space: 32, Escape: 256, Enter: 257, Tab: 258, Backspace: 259,
  Insert: 260, Delete: 261, ArrowRight: 262, ArrowLeft: 263, ArrowDown: 264, ArrowUp: 265,
  PageUp: 266, PageDown: 267, Home: 268, End: 269,
  CapsLock: 280, ScrollLock: 281, NumLock: 282, PrintScreen: 283, Pause: 284,

  F1: 290, F2: 291, F3: 292, F4: 293, F5: 294, F6: 295,
  F7: 296, F8: 297, F9: 298, F10: 299, F11: 300, F12: 301,

  ShiftLeft: 340, ControlLeft: 341, AltLeft: 342, MetaLeft: 343,
  ShiftRight: 344, ControlRight: 345, AltRight: 346, MetaRight: 347,
  ContextMenu: 348,

  Semicolon: 59, Equal: 61, Comma: 44, Minus: 45, Period: 46, Slash: 47,
  Backquote: 96, BracketLeft: 91, Backslash: 92, BracketRight: 93, Quote: 39,

  Numpad0: 320, Numpad1: 321, Numpad2: 322, Numpad3: 323, Numpad4: 324,
  Numpad5: 325, Numpad6: 326, Numpad7: 327, Numpad8: 328, Numpad9: 329,
  NumpadDecimal: 330, NumpadDivide: 331, NumpadMultiply: 332,
  NumpadSubtract: 333, NumpadAdd: 334, NumpadEnter: 335, NumpadEqual: 336
};

class InputCoordinator {
  constructor(options = {}) {
    this.sharedBuffer = options.sharedBuffer || null;
    this.canvas = options.canvas || null;

    this.windowWidth = options.width || 800;
    this.windowHeight = options.height || 450;
    this.renderWidth = options.width || 800;
    this.renderHeight = options.height || 450;
    this.dpiScale = options.dpiScale || 1.0;
    this.shouldClose = false;

    this.mouseX = -1;
    this.mouseY = -1;
    this.mouseWheelX = 0;
    this.mouseWheelY = 0;
    this.mouseButtons = 0;

    this.keysDown = new Uint32Array(16); // 512 bits
    this.keyPressedQueue = [];
    this.charPressedQueue = [];
    this.listeners = new Set();
    this.cleanupFn = null;

    if (this.sharedBuffer) {
      this.sharedView = new DataView(this.sharedBuffer);
      this.sharedU8 = new Uint8Array(this.sharedBuffer);
      this.syncWord = new Int32Array(this.sharedBuffer, 372, 1);
    }

    if (this.canvas && typeof this.canvas.addEventListener === 'function') {
      this.attachListeners(this.canvas);
    }
  }

  addListener(fn) {
    if (typeof fn === 'function') {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    return () => {};
  }

  notifyListeners(event) {
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch (_) {}
    }
  }

  detach() {
    if (typeof this.cleanupFn === 'function') {
      this.cleanupFn();
      this.cleanupFn = null;
    }
  }

  attachListeners(canvas, windowTarget = null) {
    this.detach();

    if (!canvas || typeof canvas.addEventListener !== 'function') return;

    const getCoords = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / (rect.width || 1);
      const scaleY = canvas.height / (rect.height || 1);
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    const onMouseMove = (e) => {
      const pos = getCoords(e);
      this.mouseX = pos.x;
      this.mouseY = pos.y;
      if (typeof e.buttons === 'number') {
        this.mouseButtons = e.buttons;
      }
      this.updateSharedState();
      this.notifyListeners({ type: 'mouse', x: this.mouseX, y: this.mouseY, buttons: this.mouseButtons, wheel: this.mouseWheelY });
    };

    const onMouseDown = (e) => {
      if (typeof e.buttons === 'number' && e.buttons > 0) {
        this.mouseButtons = e.buttons;
      } else {
        const bit = e.button === 0 ? 1 : (e.button === 2 ? 2 : (e.button === 1 ? 4 : 0));
        this.mouseButtons |= bit;
      }
      const pos = getCoords(e);
      this.mouseX = pos.x;
      this.mouseY = pos.y;
      this.updateSharedState();
      this.notifyListeners({ type: 'mouse', x: this.mouseX, y: this.mouseY, buttons: this.mouseButtons, wheel: this.mouseWheelY });
    };

    const onMouseUp = (e) => {
      if (typeof e.buttons === 'number') {
        this.mouseButtons = e.buttons;
      } else {
        const bit = e.button === 0 ? 1 : (e.button === 2 ? 2 : (e.button === 1 ? 4 : 0));
        this.mouseButtons &= ~bit;
      }
      const pos = getCoords(e);
      this.mouseX = pos.x;
      this.mouseY = pos.y;
      this.updateSharedState();
      this.notifyListeners({ type: 'mouse', x: this.mouseX, y: this.mouseY, buttons: this.mouseButtons, wheel: this.mouseWheelY });
    };

    const onMouseLeave = () => {
      this.mouseX = -1;
      this.mouseY = -1;
      this.mouseButtons = 0;
      this.updateSharedState();
      this.notifyListeners({ type: 'mouse', x: -1, y: -1, buttons: 0, wheel: this.mouseWheelY });
    };

    const onWheel = (e) => {
      this.mouseWheelX += (e.deltaX > 0 ? 1 : (e.deltaX < 0 ? -1 : 0));
      this.mouseWheelY += (e.deltaY > 0 ? -1 : (e.deltaY < 0 ? 1 : 0));
      this.updateSharedState();
      this.notifyListeners({ type: 'mouse', x: this.mouseX, y: this.mouseY, buttons: this.mouseButtons, wheel: this.mouseWheelY });
      e.preventDefault();
    };

    const onContextMenu = (e) => e.preventDefault();

    const onKeyDown = (e) => {
      if (e.target && e.target.id === 'btn-dock') return;
      const key = DOM_KEY_MAP[e.code] || e.keyCode;
      if (key >= 0 && key < 512) {
        const word = Math.floor(key / 32);
        const bit = key % 32;
        this.keysDown[word] |= (1 << bit);
        if (this.keyPressedQueue.length < 32) {
          this.keyPressedQueue.push(key);
        }
      }
      if (e.key && e.key.length === 1) {
        const cp = e.key.codePointAt(0);
        if (cp && this.charPressedQueue.length < 32) {
          this.charPressedQueue.push(cp);
        }
      }
      if (e.code === 'Escape') {
        this.shouldClose = true;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        if (typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
      }
      this.updateSharedState();
      this.notifyListeners({ type: 'keydown', key, code: e.code });
    };

    const onKeyUp = (e) => {
      if (e.target && e.target.id === 'btn-dock') return;
      const key = DOM_KEY_MAP[e.code] || e.keyCode;
      if (key >= 0 && key < 512) {
        const word = Math.floor(key / 32);
        const bit = key % 32;
        this.keysDown[word] &= ~(1 << bit);
      }
      this.updateSharedState();
      this.notifyListeners({ type: 'keyup', key, code: e.code });
    };

    const onBlur = () => {
      this.keysDown.fill(0);
      this.mouseButtons = 0;
      this.updateSharedState();
      this.notifyListeners({ type: 'blur' });
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    const keyTarget = windowTarget || canvas;
    const mouseUpTarget = windowTarget || canvas;

    mouseUpTarget.addEventListener('mouseup', onMouseUp);
    keyTarget.addEventListener('keydown', onKeyDown);
    keyTarget.addEventListener('keyup', onKeyUp);
    keyTarget.addEventListener('blur', onBlur);

    this.cleanupFn = () => {
      if (typeof canvas.removeEventListener === 'function') {
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mousedown', onMouseDown);
        canvas.removeEventListener('mouseleave', onMouseLeave);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('contextmenu', onContextMenu);
      }
      if (typeof mouseUpTarget.removeEventListener === 'function') {
        mouseUpTarget.removeEventListener('mouseup', onMouseUp);
      }
      if (typeof keyTarget.removeEventListener === 'function') {
        keyTarget.removeEventListener('keydown', onKeyDown);
        keyTarget.removeEventListener('keyup', onKeyUp);
        keyTarget.removeEventListener('blur', onBlur);
      }
    };
  }

  reset() {
    this.shouldClose = false;
    this.mouseX = -1;
    this.mouseY = -1;
    this.mouseButtons = 0;
    this.mouseWheelX = 0;
    this.mouseWheelY = 0;
    this.keysDown.fill(0);
    this.keyPressedQueue.length = 0;
    this.charPressedQueue.length = 0;

    if (this.sharedBuffer) {
      this.sharedU8.fill(0);
      this.updateSharedState();
    }
  }

  updateSharedState() {
    if (!this.sharedView) return;
    const v = this.sharedView;
    v.setInt32(0, this.windowWidth, true);
    v.setInt32(4, this.windowHeight, true);
    v.setInt32(8, this.renderWidth, true);
    v.setInt32(12, this.renderHeight, true);
    v.setFloat32(16, this.dpiScale, true);
    v.setInt32(20, this.shouldClose ? 1 : 0, true);

    v.setFloat32(24, this.mouseX, true);
    v.setFloat32(28, this.mouseY, true);
    v.setFloat32(32, this.mouseWheelX, true);
    v.setFloat32(36, this.mouseWheelY, true);
    v.setUint32(40, this.mouseButtons, true);

    for (let i = 0; i < 16; i++) {
      v.setUint32(44 + i * 4, this.keysDown[i], true);
    }

    const kCount = Math.min(this.keyPressedQueue.length, 32);
    v.setInt32(108, kCount, true);
    for (let i = 0; i < kCount; i++) {
      v.setInt32(112 + i * 4, this.keyPressedQueue[i], true);
    }

    const cCount = Math.min(this.charPressedQueue.length, 32);
    v.setInt32(240, cCount, true);
    for (let i = 0; i < cCount; i++) {
      v.setInt32(244 + i * 4, this.charPressedQueue[i], true);
    }
  }

  // Poll state synchronously into Wasm linear memory (used by rcore_wasi or direct wasm callers)
  pollToWasm(destPtr, mem) {
    if (this.sharedBuffer) {
      const destU8 = new Uint8Array(mem.buffer, destPtr, 372);
      destU8.set(this.sharedU8.subarray(0, 372));
      this.sharedView.setFloat32(32, 0, true);
      this.sharedView.setFloat32(36, 0, true);
      this.sharedView.setInt32(108, 0, true);
      this.sharedView.setInt32(240, 0, true);
      return;
    }

    const view = new DataView(mem.buffer, destPtr, 372);
    view.setInt32(0, this.windowWidth, true);
    view.setInt32(4, this.windowHeight, true);
    view.setInt32(8, this.renderWidth, true);
    view.setInt32(12, this.renderHeight, true);
    view.setFloat32(16, this.dpiScale, true);
    view.setInt32(20, this.shouldClose ? 1 : 0, true);

    view.setFloat32(24, this.mouseX, true);
    view.setFloat32(28, this.mouseY, true);
    view.setFloat32(32, this.mouseWheelX, true);
    view.setFloat32(36, this.mouseWheelY, true);
    view.setUint32(40, this.mouseButtons, true);

    for (let i = 0; i < 16; i++) {
      view.setUint32(44 + i * 4, this.keysDown[i], true);
    }

    const kCount = Math.min(this.keyPressedQueue.length, 32);
    view.setInt32(108, kCount, true);
    for (let i = 0; i < kCount; i++) {
      view.setInt32(112 + i * 4, this.keyPressedQueue[i], true);
    }
    this.keyPressedQueue.length = 0;

    const cCount = Math.min(this.charPressedQueue.length, 32);
    view.setInt32(240, cCount, true);
    for (let i = 0; i < cCount; i++) {
      view.setInt32(244 + i * 4, this.charPressedQueue[i], true);
    }
    this.charPressedQueue.length = 0;
  }
}


// audio-context.js - Web Audio API host bindings for raylib-wasi
// Supports direct in-thread Web Audio execution and proxying to createAudioReceiver

function createPanNode(ctx) {
  if (typeof ctx.createStereoPanner === 'function') {
    return ctx.createStereoPanner();
  }
  return null;
}

function setPanValue(panNode, pan) {
  if (!panNode) return;
  // Raylib pan: 0.0 (left) .. 0.5 (center) .. 1.0 (right)
  // Web Audio StereoPannerNode: -1.0 (left) .. 0.0 (center) .. 1.0 (right)
  const clampedPan = Math.max(0.0, Math.min(1.0, pan));
  const webPan = (clampedPan - 0.5) * 2.0;
  panNode.pan.setValueAtTime(webPan, panNode.context.currentTime);
}

function pcmToAudioBuffer(ctx, channels, sampleRate, sampleSize, frameCount, data) {
  const audioBuffer = ctx.createBuffer(channels, frameCount, sampleRate);
  const buf = (data && data.buffer) ? data.buffer : data;
  const offset = (data && typeof data.byteOffset === 'number') ? data.byteOffset : 0;

  if (sampleSize === 16) {
    const int16 = new Int16Array(buf, offset, frameCount * channels);
    for (let ch = 0; ch < channels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = int16[i * channels + ch] / 32768.0;
      }
    }
  } else if (sampleSize === 32) {
    const float32 = new Float32Array(buf, offset, frameCount * channels);
    for (let ch = 0; ch < channels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = float32[i * channels + ch];
      }
    }
  } else if (sampleSize === 8) {
    const uint8 = new Uint8Array(buf, offset, frameCount * channels);
    for (let ch = 0; ch < channels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = (uint8[i * channels + ch] - 128) / 128.0;
      }
    }
  }
  return audioBuffer;
}

class AudioStreamQueue {
  constructor(ctx, masterGain, channels, sampleRate, sampleSize) {
    this.ctx = ctx;
    this.masterGain = masterGain;
    this.channels = channels;
    this.sampleRate = sampleRate;
    this.sampleSize = sampleSize;
    this.volume = 1.0;
    this.pitch = 1.0;
    this.pan = 0.5;
    this.isPlaying = false;
    this.isPaused = false;

    this.gainNode = ctx.createGain();
    this.gainNode.gain.setValueAtTime(this.volume, ctx.currentTime);

    this.panNode = createPanNode(ctx);
    if (this.panNode) {
      setPanValue(this.panNode, this.pan);
      this.gainNode.connect(this.panNode);
      this.panNode.connect(masterGain || ctx.destination);
    } else {
      this.gainNode.connect(masterGain || ctx.destination);
    }

    this.nextPlayTime = 0;
    this.scheduledSources = [];
  }

  feedPcm(arrayBuffer, frameCount) {
    if (frameCount <= 0) return;
    const audioBuffer = pcmToAudioBuffer(
      this.ctx,
      this.channels,
      this.sampleRate,
      this.sampleSize,
      frameCount,
      arrayBuffer
    );
    this.feedAudioBuffer(audioBuffer);
  }

  feedAudioBuffer(audioBuffer) {
    if (!this.isPlaying || this.isPaused) return;

    const now = this.ctx.currentTime;
    if (this.nextPlayTime < now) {
      this.nextPlayTime = now + 0.02; // 20ms buffer ahead
    }

    const source = this.ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.setValueAtTime(this.pitch, this.ctx.currentTime);
    source.connect(this.gainNode);

    source.start(this.nextPlayTime);
    this.scheduledSources.push(source);

    const duration = audioBuffer.duration / Math.max(0.01, this.pitch);
    this.nextPlayTime += duration;

    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source);
      if (idx !== -1) this.scheduledSources.splice(idx, 1);
    };
  }

  play() {
    this.isPlaying = true;
    this.isPaused = false;
    this.nextPlayTime = this.ctx.currentTime + 0.02;
  }

  pause() {
    this.isPaused = true;
    this.stopSources();
  }

  resume() {
    if (this.isPaused) {
      this.isPaused = false;
      this.isPlaying = true;
      this.nextPlayTime = this.ctx.currentTime + 0.02;
    }
  }

  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this.stopSources();
    this.nextPlayTime = 0;
  }

  stopSources() {
    for (const src of this.scheduledSources) {
      try {
        src.stop();
        src.disconnect();
      } catch (_) {}
    }
    this.scheduledSources = [];
  }

  setVolume(vol) {
    this.volume = Math.max(0.0, vol);
    this.gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
  }

  setPitch(pitch) {
    this.pitch = Math.max(0.01, pitch);
    for (const src of this.scheduledSources) {
      src.playbackRate.setValueAtTime(this.pitch, this.ctx.currentTime);
    }
  }

  setPan(pan) {
    this.pan = pan;
    setPanValue(this.panNode, pan);
  }

  destroy() {
    this.stop();
    try {
      this.gainNode.disconnect();
      if (this.panNode) this.panNode.disconnect();
    } catch (_) {}
  }
}

function createAudioImports(getMemory, options = {}) {
  let audioCtx = options.audioContext || null;
  let masterGain = null;
  let masterVolume = 1.0;
  let isReady = false;

  let nextBufferId = 1;
  const buffers = new Map(); // bufferId -> AudioBuffer (direct mode) or metadata (proxy mode)

  let nextVoiceId = 1;
  const voices = new Map(); // voiceId -> voice record

  let nextStreamId = 1;
  const streams = new Map(); // streamId -> AudioStreamQueue

  const useProxy = Boolean(options.onAudioMessage);

  function getAudioContext() {
    if (audioCtx) return audioCtx;
    const AudioContextClass = typeof AudioContext !== 'undefined'
      ? AudioContext
      : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);

    if (AudioContextClass) {
      try {
        audioCtx = new AudioContextClass();
      } catch (_) {}
    }
    return audioCtx;
  }

  function ensureMasterGain() {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (!masterGain) {
      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(masterVolume, ctx.currentTime);
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  function copyPcmFromWasm(channels, sampleSize, frameCount, dataPtr) {
    const mem = getMemory();
    const totalSamples = frameCount * channels;
    if (sampleSize === 16) {
      const src = new Int16Array(mem.buffer, dataPtr, totalSamples);
      const copy = new Int16Array(totalSamples);
      copy.set(src);
      return copy.buffer;
    } else if (sampleSize === 32) {
      const src = new Float32Array(mem.buffer, dataPtr, totalSamples);
      const copy = new Float32Array(totalSamples);
      copy.set(src);
      return copy.buffer;
    } else if (sampleSize === 8) {
      const src = new Uint8Array(mem.buffer, dataPtr, totalSamples);
      const copy = new Uint8Array(totalSamples);
      copy.set(src);
      return copy.buffer;
    }
    return null;
  }

  return {
    raylib_host_audio_init: () => {
      isReady = true;
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_init' });
        return 0;
      }
      const ctx = getAudioContext();
      if (ctx) {
        ensureMasterGain();
        if (options.onAudioInit) options.onAudioInit();
        return 0;
      }
      return 0; // Return success so C state initializes
    },

    raylib_host_audio_close: () => {
      for (const [id, voice] of voices.entries()) {
        if (voice.source) {
          try { voice.source.stop(); voice.source.disconnect(); } catch (_) {}
        }
      }
      voices.clear();
      buffers.clear();

      for (const [id, stream] of streams.entries()) {
        if (typeof stream.destroy === 'function') stream.destroy();
      }
      streams.clear();

      if (audioCtx) {
        try { audioCtx.close(); } catch (_) {}
        audioCtx = null;
      }
      masterGain = null;
      isReady = false;

      if (useProxy) {
        options.onAudioMessage({ type: 'audio_close' });
      }
    },

    raylib_host_audio_is_ready: () => {
      return isReady ? 1 : 0;
    },

    raylib_host_audio_set_master_volume: (volume) => {
      masterVolume = Math.max(0.0, volume);
      if (masterGain && audioCtx) {
        masterGain.gain.setValueAtTime(masterVolume, audioCtx.currentTime);
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_master_volume', volume: masterVolume });
      }
    },

    raylib_host_audio_get_master_volume: () => {
      return masterVolume;
    },

    // --- Sound Buffer Management ---
    raylib_host_audio_create_buffer: (channels, sampleRate, sampleSize, frameCount, dataPtr) => {
      if (frameCount <= 0 || channels <= 0) return 0;
      const id = nextBufferId++;

      if (useProxy) {
        const pcmBuf = copyPcmFromWasm(channels, sampleSize, frameCount, dataPtr);
        buffers.set(id, {
          channels,
          sampleRate,
          sampleSize,
          frameCount,
          duration: frameCount / sampleRate
        });
        if (pcmBuf) {
          options.onAudioMessage({
            type: 'audio_create_buffer',
            bufferId: id,
            channels,
            sampleRate,
            sampleSize,
            frameCount,
            data: pcmBuf
          }, [pcmBuf]);
        }
        return id;
      }

      const ctx = getAudioContext();
      if (!ctx) {
        // Fallback buffer metadata
        buffers.set(id, { duration: frameCount / sampleRate });
        return id;
      }
      ensureMasterGain();

      try {
        const mem = getMemory();
        const pcmSlice = copyPcmFromWasm(channels, sampleSize, frameCount, dataPtr);
        const audioBuf = pcmToAudioBuffer(ctx, channels, sampleRate, sampleSize, frameCount, pcmSlice);
        buffers.set(id, audioBuf);
        return id;
      } catch (err) {
        console.warn('raylib-wasi: Failed to create audio buffer:', err);
        return 0;
      }
    },

    raylib_host_audio_update_buffer: (bufferId, dataPtr, frameCount) => {
      if (useProxy) {
        const meta = buffers.get(bufferId);
        if (!meta) return;
        const pcmBuf = copyPcmFromWasm(meta.channels, meta.sampleSize, frameCount, dataPtr);
        if (pcmBuf) {
          options.onAudioMessage({
            type: 'audio_update_buffer',
            bufferId,
            frameCount,
            data: pcmBuf
          }, [pcmBuf]);
        }
        return;
      }

      const audioBuf = buffers.get(bufferId);
      const ctx = getAudioContext();
      if (!audioBuf || !ctx || frameCount <= 0 || typeof audioBuf.getChannelData !== 'function') return;

      const channels = audioBuf.numberOfChannels;
      const mem = getMemory();
      const float32 = new Float32Array(mem.buffer, dataPtr, frameCount * channels);
      for (let ch = 0; ch < channels; ch++) {
        const chData = audioBuf.getChannelData(ch);
        const count = Math.min(frameCount, chData.length);
        for (let i = 0; i < count; i++) {
          chData[i] = float32[i * channels + ch];
        }
      }
    },

    raylib_host_audio_destroy_buffer: (bufferId) => {
      buffers.delete(bufferId);
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_destroy_buffer', bufferId });
      }
    },

    // --- Sound Voice Playback Management ---
    raylib_host_audio_play: (bufferId, volume, pitch, pan, loop) => {
      const voiceId = nextVoiceId++;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());

      if (useProxy) {
        const meta = buffers.get(bufferId);
        const dur = meta ? (meta.duration / Math.max(0.01, pitch)) : 1.0;
        voices.set(voiceId, {
          bufferId,
          volume,
          pitch,
          pan,
          loop: Boolean(loop),
          isPlaying: true,
          isPaused: false,
          startTime: now,
          duration: dur
        });
        options.onAudioMessage({
          type: 'audio_play',
          voiceId,
          bufferId,
          volume,
          pitch,
          pan,
          loop: Boolean(loop)
        });
        return voiceId;
      }

      const audioBuf = buffers.get(bufferId);
      const ctx = getAudioContext();
      if (!audioBuf || !ctx || typeof ctx.createBufferSource !== 'function') {
        voices.set(voiceId, { isPlaying: true, isPaused: false, startTime: now, duration: 1.0 });
        return voiceId;
      }
      ensureMasterGain();

      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.loop = Boolean(loop);

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(Math.max(0.0, volume), ctx.currentTime);

      const panNode = createPanNode(ctx);
      if (panNode) {
        setPanValue(panNode, pan);
        source.connect(gainNode);
        gainNode.connect(panNode);
        panNode.connect(masterGain || ctx.destination);
      } else {
        source.connect(gainNode);
        gainNode.connect(masterGain || ctx.destination);
      }

      source.playbackRate.setValueAtTime(Math.max(0.01, pitch), ctx.currentTime);

      const voiceRecord = {
        source,
        gainNode,
        panNode,
        bufferId,
        volume,
        pitch,
        pan,
        loop: Boolean(loop),
        isPlaying: true,
        isPaused: false,
        startTime: ctx.currentTime,
        pausedAt: 0,
        duration: audioBuf.duration / Math.max(0.01, pitch)
      };

      source.onended = () => {
        voiceRecord.isPlaying = false;
        voiceRecord.isPaused = false;
        voices.delete(voiceId);
      };

      source.start(0);
      voices.set(voiceId, voiceRecord);
      return voiceId;
    },

    raylib_host_audio_stop: (voiceId) => {
      const voice = voices.get(voiceId);
      if (voice) {
        if (voice.source) {
          voice.source.onended = null;
          try { voice.source.stop(); voice.source.disconnect(); } catch (_) {}
        }
        voice.isPlaying = false;
        voice.isPaused = false;
        voices.delete(voiceId);
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stop', voiceId });
      }
    },

    raylib_host_audio_pause: (voiceId) => {
      const voice = voices.get(voiceId);
      if (!voice || !voice.isPlaying || voice.isPaused) return;

      if (useProxy) {
        voice.isPaused = true;
        options.onAudioMessage({ type: 'audio_pause', voiceId });
        return;
      }

      const ctx = getAudioContext();
      voice.pausedAt = (ctx.currentTime - voice.startTime) * voice.pitch;
      voice.isPaused = true;
      if (voice.source) {
        voice.source.onended = null;
        try { voice.source.stop(); } catch (_) {}
      }
    },

    raylib_host_audio_resume: (voiceId) => {
      const voice = voices.get(voiceId);
      if (!voice || !voice.isPaused) return;

      if (useProxy) {
        voice.isPaused = false;
        voice.startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        options.onAudioMessage({ type: 'audio_resume', voiceId });
        return;
      }

      const ctx = getAudioContext();
      const audioBuf = buffers.get(voice.bufferId);
      if (!ctx || !audioBuf) return;

      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.loop = voice.loop;
      source.playbackRate.setValueAtTime(voice.pitch, ctx.currentTime);
      source.connect(voice.gainNode);

      source.onended = () => {
        voice.isPlaying = false;
        voice.isPaused = false;
        voices.delete(voiceId);
      };

      const offset = (voice.pausedAt || 0) % (audioBuf.duration || 1);
      source.start(0, offset);
      voice.source = source;
      voice.startTime = ctx.currentTime - (offset / Math.max(0.01, voice.pitch));
      voice.isPaused = false;
      voice.isPlaying = true;
    },

    raylib_host_audio_is_playing: (voiceId) => {
      const voice = voices.get(voiceId);
      if (!voice || !voice.isPlaying || voice.isPaused) return 0;
      if (useProxy) {
        if (!voice.loop) {
          const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          if (now - voice.startTime >= (voice.duration * 1000)) {
            voice.isPlaying = false;
            voices.delete(voiceId);
            return 0;
          }
        }
        return 1;
      }
      return (voice.isPlaying && !voice.isPaused) ? 1 : 0;
    },

    raylib_host_audio_set_volume: (voiceId, volume) => {
      const voice = voices.get(voiceId);
      if (voice) {
        voice.volume = Math.max(0.0, volume);
        if (voice.gainNode && audioCtx) {
          voice.gainNode.gain.setValueAtTime(voice.volume, audioCtx.currentTime);
        }
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_set_volume', voiceId, volume });
      }
    },

    raylib_host_audio_set_pitch: (voiceId, pitch) => {
      const voice = voices.get(voiceId);
      if (voice) {
        voice.pitch = Math.max(0.01, pitch);
        if (voice.source && audioCtx) {
          voice.source.playbackRate.setValueAtTime(voice.pitch, audioCtx.currentTime);
        }
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_set_pitch', voiceId, pitch });
      }
    },

    raylib_host_audio_set_pan: (voiceId, pan) => {
      const voice = voices.get(voiceId);
      if (voice) {
        voice.pan = pan;
        if (voice.panNode) setPanValue(voice.panNode, pan);
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_set_pan', voiceId, pan });
      }
    },

    // --- AudioStream Management ---
    raylib_host_audio_stream_init: (channels, sampleRate, sampleSize) => {
      const streamId = nextStreamId++;
      if (useProxy) {
        streams.set(streamId, { channels, sampleRate, sampleSize, isPlaying: false, isPaused: false });
        options.onAudioMessage({ type: 'audio_stream_init', streamId, channels, sampleRate, sampleSize });
        return streamId;
      }

      const ctx = getAudioContext();
      if (!ctx) return streamId;
      ensureMasterGain();

      const stream = new AudioStreamQueue(ctx, masterGain, channels, sampleRate, sampleSize);
      streams.set(streamId, stream);
      return streamId;
    },

    raylib_host_audio_stream_destroy: (streamId) => {
      const stream = streams.get(streamId);
      if (stream && typeof stream.destroy === 'function') stream.destroy();
      streams.delete(streamId);
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_destroy', streamId });
      }
    },

    raylib_host_audio_stream_feed: (streamId, dataPtr, frameCount) => {
      const stream = streams.get(streamId);
      if (!stream) return;

      if (useProxy) {
        const pcmBuf = copyPcmFromWasm(stream.channels, stream.sampleSize, frameCount, dataPtr);
        if (pcmBuf) {
          options.onAudioMessage({
            type: 'audio_stream_feed',
            streamId,
            frameCount,
            data: pcmBuf
          }, [pcmBuf]);
        }
        return;
      }

      const mem = getMemory();
      const pcmSlice = copyPcmFromWasm(stream.channels, stream.sampleSize, frameCount, dataPtr);
      stream.feedPcm(pcmSlice, frameCount);
    },

    raylib_host_audio_stream_play: (streamId) => {
      const stream = streams.get(streamId);
      if (stream) {
        stream.isPlaying = true;
        stream.isPaused = false;
        if (typeof stream.play === 'function') stream.play();
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_play', streamId });
      }
    },

    raylib_host_audio_stream_pause: (streamId) => {
      const stream = streams.get(streamId);
      if (stream) {
        stream.isPaused = true;
        if (typeof stream.pause === 'function') stream.pause();
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_pause', streamId });
      }
    },

    raylib_host_audio_stream_resume: (streamId) => {
      const stream = streams.get(streamId);
      if (stream) {
        stream.isPaused = false;
        stream.isPlaying = true;
        if (typeof stream.resume === 'function') stream.resume();
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_resume', streamId });
      }
    },

    raylib_host_audio_stream_stop: (streamId) => {
      const stream = streams.get(streamId);
      if (stream) {
        stream.isPlaying = false;
        stream.isPaused = false;
        if (typeof stream.stop === 'function') stream.stop();
      }
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_stop', streamId });
      }
    },

    raylib_host_audio_stream_is_playing: (streamId) => {
      const stream = streams.get(streamId);
      return (stream && stream.isPlaying && !stream.isPaused) ? 1 : 0;
    },

    raylib_host_audio_stream_set_volume: (streamId, volume) => {
      const stream = streams.get(streamId);
      if (stream && typeof stream.setVolume === 'function') stream.setVolume(volume);
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_set_volume', streamId, volume });
      }
    },

    raylib_host_audio_stream_set_pitch: (streamId, pitch) => {
      const stream = streams.get(streamId);
      if (stream && typeof stream.setPitch === 'function') stream.setPitch(pitch);
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_set_pitch', streamId, pitch });
      }
    },

    raylib_host_audio_stream_set_pan: (streamId, pan) => {
      const stream = streams.get(streamId);
      if (stream && typeof stream.setPan === 'function') stream.setPan(pan);
      if (useProxy) {
        options.onAudioMessage({ type: 'audio_stream_set_pan', streamId, pan });
      }
    }
  };
}

// Standalone receiver for main threads receiving audio messages from workers
function createAudioReceiver(options = {}) {
  const AudioContextClass = typeof AudioContext !== 'undefined'
    ? AudioContext
    : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);

  let ctx = options.audioContext || null;
  let masterGain = null;
  const buffers = new Map();
  const voices = new Map();
  const streams = new Map();

  function getContext() {
    if (!ctx && AudioContextClass) {
      try {
        ctx = new AudioContextClass();
        masterGain = ctx.createGain();
        masterGain.connect(ctx.destination);
      } catch (err) {
        console.warn('raylib-wasi createAudioReceiver: AudioContext creation failed:', err);
      }
    }
    if (ctx && !masterGain) {
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  return {
    handleMessage: (msg) => {
      if (!msg || !msg.type) return;
      const c = getContext();

      switch (msg.type) {
        case 'audio_init': {
          getContext();
          break;
        }

        case 'audio_close': {
          for (const [id, voice] of voices.entries()) {
            try { voice.source.stop(); voice.source.disconnect(); } catch (_) {}
          }
          voices.clear();
          buffers.clear();
          for (const [id, stream] of streams.entries()) {
            stream.destroy();
          }
          streams.clear();
          if (ctx) {
            try { ctx.close(); } catch (_) {}
            ctx = null;
            masterGain = null;
          }
          break;
        }

        case 'audio_master_volume': {
          if (masterGain && c) {
            masterGain.gain.setValueAtTime(Math.max(0.0, msg.volume), c.currentTime);
          }
          break;
        }

        case 'audio_create_buffer': {
          if (!c) return;
          try {
            const audioBuf = pcmToAudioBuffer(
              c,
              msg.channels,
              msg.sampleRate,
              msg.sampleSize,
              msg.frameCount,
              msg.data
            );
            buffers.set(msg.bufferId, audioBuf);
          } catch (err) {
            console.warn('createAudioReceiver: failed to create buffer:', err);
          }
          break;
        }

        case 'audio_update_buffer': {
          const audioBuf = buffers.get(msg.bufferId);
          if (!audioBuf) return;
          const float32 = new Float32Array(msg.data);
          const chCount = audioBuf.numberOfChannels;
          for (let ch = 0; ch < chCount; ch++) {
            const chData = audioBuf.getChannelData(ch);
            const count = Math.min(msg.frameCount, chData.length);
            for (let i = 0; i < count; i++) {
              chData[i] = float32[i * chCount + ch];
            }
          }
          break;
        }

        case 'audio_destroy_buffer': {
          buffers.delete(msg.bufferId);
          break;
        }

        case 'audio_play': {
          if (!c) return;
          const audioBuf = buffers.get(msg.bufferId);
          if (!audioBuf) {
            console.warn('createAudioReceiver: audio buffer not found:', msg.bufferId);
            return;
          }

          const source = c.createBufferSource();
          source.buffer = audioBuf;
          source.loop = Boolean(msg.loop);

          const gainNode = c.createGain();
          gainNode.gain.setValueAtTime(Math.max(0.0, msg.volume), c.currentTime);

          const panNode = createPanNode(c);
          if (panNode) {
            setPanValue(panNode, msg.pan);
            source.connect(gainNode);
            gainNode.connect(panNode);
            panNode.connect(masterGain || c.destination);
          } else {
            source.connect(gainNode);
            gainNode.connect(masterGain || c.destination);
          }

          source.playbackRate.setValueAtTime(Math.max(0.01, msg.pitch), c.currentTime);

          const voiceRecord = {
            source,
            gainNode,
            panNode,
            bufferId: msg.bufferId,
            volume: msg.volume,
            pitch: msg.pitch,
            pan: msg.pan,
            loop: Boolean(msg.loop),
            startTime: c.currentTime,
            pausedAt: 0
          };

          source.onended = () => {
            voices.delete(msg.voiceId);
          };

          source.start(0);
          voices.set(msg.voiceId, voiceRecord);
          break;
        }

        case 'audio_stop': {
          const voice = voices.get(msg.voiceId);
          if (voice) {
            voice.source.onended = null;
            try { voice.source.stop(); voice.source.disconnect(); } catch (_) {}
            voices.delete(msg.voiceId);
          }
          break;
        }

        case 'audio_pause': {
          const voice = voices.get(msg.voiceId);
          if (!voice || !c) return;
          voice.pausedAt = (c.currentTime - voice.startTime) * voice.pitch;
          voice.isPaused = true;
          voice.source.onended = null;
          try { voice.source.stop(); } catch (_) {}
          break;
        }

        case 'audio_resume': {
          const voice = voices.get(msg.voiceId);
          if (!voice || !c) return;
          const audioBuf = buffers.get(voice.bufferId);
          if (!audioBuf) return;

          const source = c.createBufferSource();
          source.buffer = audioBuf;
          source.loop = voice.loop;
          source.playbackRate.setValueAtTime(voice.pitch, c.currentTime);
          source.connect(voice.gainNode);

          source.onended = () => {
            voices.delete(msg.voiceId);
          };

          const offset = (voice.pausedAt || 0) % (audioBuf.duration || 1);
          source.start(0, offset);
          voice.source = source;
          voice.startTime = c.currentTime - (offset / Math.max(0.01, voice.pitch));
          voice.isPaused = false;
          break;
        }

        case 'audio_set_volume': {
          const voice = voices.get(msg.voiceId);
          if (voice && c) {
            voice.volume = Math.max(0.0, msg.volume);
            voice.gainNode.gain.setValueAtTime(voice.volume, c.currentTime);
          }
          break;
        }

        case 'audio_set_pitch': {
          const voice = voices.get(msg.voiceId);
          if (voice && c) {
            voice.pitch = Math.max(0.01, msg.pitch);
            voice.source.playbackRate.setValueAtTime(voice.pitch, c.currentTime);
          }
          break;
        }

        case 'audio_set_pan': {
          const voice = voices.get(msg.voiceId);
          if (voice) {
            voice.pan = msg.pan;
            if (voice.panNode) setPanValue(voice.panNode, msg.pan);
          }
          break;
        }

        case 'audio_stream_init': {
          if (!c) return;
          const stream = new AudioStreamQueue(c, masterGain, msg.channels, msg.sampleRate, msg.sampleSize);
          streams.set(msg.streamId, stream);
          break;
        }

        case 'audio_stream_feed': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.feedPcm(msg.data, msg.frameCount);
          break;
        }

        case 'audio_stream_play': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.play();
          break;
        }

        case 'audio_stream_pause': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.pause();
          break;
        }

        case 'audio_stream_resume': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.resume();
          break;
        }

        case 'audio_stream_stop': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.stop();
          break;
        }

        case 'audio_stream_destroy': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.destroy();
          streams.delete(msg.streamId);
          break;
        }

        case 'audio_stream_set_volume': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.setVolume(msg.volume);
          break;
        }

        case 'audio_stream_set_pitch': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.setPitch(msg.pitch);
          break;
        }

        case 'audio_stream_set_pan': {
          const stream = streams.get(msg.streamId);
          if (stream) stream.setPan(msg.pan);
          break;
        }
      }
    },
    getContext: () => getContext(),
    resume: () => {
      const c = getContext();
      if (c && c.state === 'suspended') {
        return c.resume();
      }
      return Promise.resolve();
    },
    getState: () => {
      const c = getContext();
      return c ? c.state : 'uninitialized';
    }
  };
}


// index.js - raylib-wasi Host Bridge entry point






const RAYLIB_HAS_SAB = typeof SharedArrayBuffer !== 'undefined';

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
function createWasiImports(getMemory, options = {}) {
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

function createRaylibHost(options = {}) {
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
    if (RAYLIB_HAS_SAB && mem.buffer instanceof SharedArrayBuffer) {
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

class RaylibReferenceHost {
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



export { createGLImports, createMockGL, InputCoordinator, createWasiImports, createAudioImports, createAudioReceiver, createRaylibHost, RaylibReferenceHost, WasiHost, ProcExit, normalizePath };
export default createRaylibHost;

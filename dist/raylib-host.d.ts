/**
 * raylib-wasi Host Bridge TypeScript Definitions
 */

export interface WasiPreopenEntry {
  fd: number;
  path: string;
  name?: string;
}

export interface WasiHostLike {
  setMemory?(memoryOrGetter: WebAssembly.Memory | (() => WebAssembly.Memory)): void;
  getImports?(): Record<string, Function>;
  createImportObject?(): {
    wasi_snapshot_preview1: Record<string, Function>;
    wasi_unstable?: Record<string, Function>;
    [namespace: string]: Record<string, Function> | undefined;
  };
}

export interface WasiHostOptions {
  vfs?: object | Map<string, unknown> | null;
  cwd?: string;
  argv?: string[];
  environ?: Record<string, string>;
  preopens?: WasiPreopenEntry[];
  stdin?: ((iovsPtr: number, iovsLen: number, nreadOut: number, host: WasiHost) => number) | Uint8Array | string | null;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  getMemory?: WebAssembly.Memory | (() => WebAssembly.Memory | null) | null;
  onFileSync?: ((path: string, bytes: Uint8Array) => void) | null;
  onFileDelete?: ((path: string) => void) | null;
}

export interface RaylibHostOptions {
  canvas?: HTMLCanvasElement | OffscreenCanvas | null;
  gl?: WebGLRenderingContext | null;
  audioContext?: AudioContext | null;
  sharedBuffer?: SharedArrayBuffer | null;
  inputCoordinator?: InputCoordinator | null;
  input?: InputCoordinator | null;
  wasiHost?: WasiHostLike | null;
  wasiImports?: Record<string, Function> | null;
  vfs?: object | Map<string, unknown> | null;
  cwd?: string;
  argv?: string[];
  environ?: Record<string, string>;
  preopens?: WasiPreopenEntry[];
  stdin?: WasiHostOptions['stdin'];
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  width?: number;
  height?: number;
  dpiScale?: number;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
  onExit?: (code: number) => void;
  onFrame?: (bitmap?: ImageBitmap | null) => void;
  onFPS?: (fps: number) => void;
  onInitWindow?: (width: number, height: number, title: string) => void;
  onClose?: () => void;
  onAudioInit?: () => void;
  onAudioMessage?: (msg: any, transfer?: Transferable[]) => void;
}

export interface RaylibHostInstance {
  input: InputCoordinator;
  gl: WebGLRenderingContext | null;
  wasiHost: WasiHostLike | null;
  audio: Record<string, Function>;
  getImports(): {
    gl: Record<string, Function>;
    raylib: Record<string, Function>;
    audio: Record<string, Function>;
    wasi_snapshot_preview1: Record<string, Function>;
    wasi_unstable: Record<string, Function>;
  };
  setMemory(mem: WebAssembly.Memory): void;
  setInstance(inst: WebAssembly.Instance): void;
  run(wasmBinary: BufferSource): Promise<WebAssembly.Instance>;
}

export class InputCoordinator {
  constructor(options?: {
    canvas?: HTMLCanvasElement | OffscreenCanvas | null;
    sharedBuffer?: SharedArrayBuffer | null;
    width?: number;
    height?: number;
    dpiScale?: number;
  });
  addListener(fn: (event: any) => void): () => void;
  notifyListeners(event: any): void;
  detach(): void;
  attachListeners(canvas: HTMLCanvasElement, windowTarget?: Window | null): void;
  reset(): void;
  updateSharedState(): void;
  pollToWasm(statePtr: number, wasmMemory: WebAssembly.Memory): void;
}

export function createGLImports(
  gl: WebGLRenderingContext,
  getMemory: () => WebAssembly.Memory
): Record<string, Function>;

export function createMockGL(stats?: Record<string, any>): any;

export class RaylibReferenceHost {
  constructor(options?: RaylibHostOptions & { maxFrames?: number });
  pressKey(keyCode: number): void;
  releaseKey(keyCode: number): void;
  setMousePosition(x: number, y: number): void;
  pressMouseButton(button?: number): void;
  releaseMouseButton(button?: number): void;
  requestClose(): void;
  run(wasmBinary: BufferSource | string, runtimeOptions?: { maxFrames?: number }): Promise<{
    exitCode: number;
    framesRendered: number;
    drawCalls: number;
    clearCount: number;
    stdoutLines: string[];
    stderrLines: string[];
    audioMessages: any[];
  }>;
}

export function createWasiImports(
  getMemory: () => WebAssembly.Memory,
  options?: WasiHostOptions & {
    print?: (text: string) => void;
    printErr?: (text: string) => void;
    onExit?: (code: number) => void;
  }
): Record<string, Function>;

export function createAudioImports(
  getMemory: () => WebAssembly.Memory,
  options?: RaylibHostOptions
): Record<string, Function>;

export function createAudioReceiver(options?: object): {
  handleMessage(msg: any): void;
  getContext(): AudioContext | null;
  resume(): Promise<void>;
  getState(): string;
};

export function createRaylibHost(options?: RaylibHostOptions): RaylibHostInstance;

export class ProcExit extends Error {
  code: number;
  exitCode?: number;
  changedFiles: Map<string, Uint8Array> | null;
  deletedFiles: Set<string> | null;
  constructor(code: number, changedFiles?: Map<string, Uint8Array> | null, deletedFiles?: Set<string> | null);
}

export class WasiHost implements WasiHostLike {
  constructor(options?: WasiHostOptions);
  setMemory(memoryOrGetter: WebAssembly.Memory | (() => WebAssembly.Memory | null)): void;
  getImports(): Record<string, Function>;
  createImportObject(customEnv?: Record<string, Function>): {
    wasi_snapshot_preview1: Record<string, Function>;
    wasi_unstable: Record<string, Function>;
    env: Record<string, Function>;
  };
}

export function normalizePath(path: string): string;

export default createRaylibHost;

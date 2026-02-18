const SHARE_BASE_URL = 'https://turingviz.org/';
const SHARE_VERSION_PREFIX = 'v2.br.';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type BrotliCodec = {
  compress: (data: Uint8Array) => Uint8Array;
  decompress: (data: Uint8Array) => Uint8Array;
};

let codecPromise: Promise<BrotliCodec> | null = null;

async function getNodeCodec(): Promise<BrotliCodec> {
  const specifier = 'node:zlib';
  const zlib = await import(/* @vite-ignore */ specifier);

  return {
    compress: (data) => {
      const compressed = zlib.brotliCompressSync(Buffer.from(data), {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        },
      });
      return new Uint8Array(compressed);
    },
    decompress: (data) => {
      const decompressed = zlib.brotliDecompressSync(Buffer.from(data));
      return new Uint8Array(decompressed);
    },
  };
}

async function getBrowserCodec(): Promise<BrotliCodec> {
  const mod = await import('brotli-wasm');
  const resolved = await (mod.default ?? mod);
  const apiLike = resolved as
    | {
        compress?: (data: Uint8Array, options?: { quality?: number }) => Uint8Array;
        decompress?: (data: Uint8Array) => Uint8Array;
      }
    | undefined;

  if (!apiLike?.compress || !apiLike?.decompress) {
    throw new Error('Brotli codec initialization failed.');
  }

  return {
    compress: (data) => apiLike.compress!(data, { quality: 11 }),
    decompress: (data) => apiLike.decompress!(data),
  };
}

async function getCodec(): Promise<BrotliCodec> {
  if (!codecPromise) {
    codecPromise = (import.meta.env.SSR ? getNodeCodec() : getBrowserCodec()).catch(
      (error) => {
        codecPromise = null;
        throw error;
      }
    );
  }
  return codecPromise;
}

function toBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  const base64 = normalized + '='.repeat(padding);

  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encodeSharedMachine(code: string): Promise<string | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const codec = await getCodec();
  const compressed = codec.compress(textEncoder.encode(code));
  return toBase64Url(compressed);
}

export async function decodeSharedMachine(encoded: string): Promise<string | null> {
  if (!encoded) return null;

  try {
    const codec = await getCodec();
    const decompressed = codec.decompress(fromBase64Url(encoded));
    const decoded = textDecoder.decode(decompressed);
    return decoded.length ? decoded : null;
  } catch {
    return null;
  }
}

export async function buildSharedMachineUrl(code: string): Promise<string | null> {
  const encoded = await encodeSharedMachine(code);
  if (!encoded) return null;

  return `${SHARE_BASE_URL}#tm=${SHARE_VERSION_PREFIX}${encoded}`;
}

function stripHashPrefix(hash: string): string {
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
  if (withoutHash.startsWith('/?')) return withoutHash.slice(2);
  if (withoutHash.startsWith('?')) return withoutHash.slice(1);
  return withoutHash;
}

export function hasSharedMachineInHash(hash: string): boolean {
  const params = new URLSearchParams(stripHashPrefix(hash));
  return Boolean(params.get('tm'));
}

export async function parseSharedMachineFromHash(hash: string): Promise<string | null> {
  const params = new URLSearchParams(stripHashPrefix(hash));
  const raw = params.get('tm');
  if (!raw) return null;

  // Backward compatibility for old lz-string links.
  if (raw.startsWith('v1.')) return null;

  const encoded = raw.startsWith(SHARE_VERSION_PREFIX)
    ? raw.slice(SHARE_VERSION_PREFIX.length)
    : raw;

  return decodeSharedMachine(encoded);
}

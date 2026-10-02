declare module 'gifenc' {
  export type GifPaletteEntry = number[];

  export interface QuantizeOptions {
    format?: 'rgb565' | 'rgb444' | 'rgba4444';
    oneBitAlpha?: boolean | number;
    clearAlpha?: boolean;
    clearAlphaThreshold?: number;
    clearAlphaColor?: number;
  }

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions,
  ): GifPaletteEntry[];

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifPaletteEntry[],
    format?: 'rgb565' | 'rgb444' | 'rgba4444',
  ): Uint8Array;

  export interface WriteFrameOptions {
    palette?: GifPaletteEntry[];
    first?: boolean;
    transparent?: boolean;
    transparentIndex?: number;
    delay?: number;
    repeat?: number;
    dispose?: number;
    flip?: boolean;
    colorDepth?: number;
  }

  export interface GifEncoderStream {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: WriteFrameOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
    writeHeader(): void;
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): GifEncoderStream;
}

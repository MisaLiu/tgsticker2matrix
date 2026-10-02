/**
 * Import pipeline: convert (browser) → zip / upload → write MSC2545 events.
 */
import {
  downloadByFileId,
  type DownloadedSticker,
  type TgStickerSet,
} from './telegram.js';
import { assignShortcodes, prefixShortcodes } from './shortcode.js';
import { buildSableZip } from './sable-archive.js';
import { tgsToGif, type ConvertedGif } from './convert/tgs.js';
import { webmToGif } from './convert/webm.js';
import type { MatrixClient } from './matrix.js';
import { buildFluffyZip } from './fluffy-archive.js';
import { importMatrixPacks } from './matrix-pack.js';

export type TargetKind = 'user' | 'room' | 'zip' | 'fluffy';

export type RunStage = 'convert' | 'zip' | 'upload' | 'write' | 'done';

export interface RunProgress {
  stage: RunStage;
  current: number;
  total: number;
  detail?: string;
}

export interface RunConfig {
  telegramToken: string;
  matrix: MatrixClient | null;
  targets: Record<TargetKind, boolean>;
  convertAnimated: boolean;
  roomMode: { kind: 'create' } | { kind: 'existing'; roomId: string };
}

export interface ConvertedAsset {
  shortcode: string;
  body: string;
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
  /** How this asset's bytes were produced. */
  source: 'static' | 'gif' | 'thumb';
}

export interface RunResult {
  zip?: { bytes: Uint8Array; filename: string };
  fluffyZip?: { bytes: Uint8Array; filename: string };
  userImported?: boolean;
  room?: { roomId: string; stateKey: string; displayName: string };
  assets: ConvertedAsset[];
  droppedShortcodes: string[];
  /** Animated/video stickers that ended up as static images. */
  degraded: number;
  /** Stickers that could not be downloaded or converted at all. */
  skipped: number;
}

export class PipelineError extends Error {}

export function sniffImageMime(bytes: Uint8Array, fallback: string): string {
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF') {
    const type = String.fromCharCode(...bytes.slice(8, 12));
    if (type === 'WEBP') return 'image/webp';
  }
  if (bytes.length >= 4) {
    const head = String.fromCharCode(...bytes.slice(0, 4));
    if (head === '\x89PNG') return 'image/png';
    if (head === 'GIF8') return 'image/gif';
    if (head === '\x1aE\xdf\xa3') return 'video/webm';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  return fallback;
}

async function toBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function slugForFile(text: string): string {
  const slug = text
    .replaceAll(/[^a-zA-Z0-9_-]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '');
  return slug === '' ? 'sticker-pack' : slug;
}

export function defaultAttribution(setName: string): string {
  return `Converted from Telegram t.me/addstickers/${setName}`;
}

async function convertAssets(
  set: TgStickerSet,
  stickers: DownloadedSticker[],
  config: RunConfig,
  onProgress: (p: RunProgress) => void,
): Promise<{ assets: ConvertedAsset[]; degraded: number; skipped: number }> {
  const shortcodes = prefixShortcodes(
    set.name,
    assignShortcodes(stickers.map((s) => s.sticker.emoji)),
  );
  const assets: ConvertedAsset[] = [];
  let degraded = 0;
  let skipped = 0;
  let current = 0;
  const total = stickers.length;

  for (let i = 0; i < stickers.length; i++) {
    const item = stickers[i]!;
    const shortcode = shortcodes[i]!;
    const body = item.sticker.emoji ?? '';
    current += 1;
    onProgress({
      stage: 'convert',
      current,
      total,
      detail: `${shortcode} (${item.kind})`,
    });

    const finish = (
      bytes: Uint8Array,
      mime: string,
      width: number,
      height: number,
      source: ConvertedAsset['source'],
    ): void => {
      assets.push({ shortcode, body, bytes, mime, width, height, source });
    };

    if (item.kind === 'static') {
      const bytes = await toBytes(item.blob);
      finish(
        bytes,
        sniffImageMime(bytes, 'image/webp'),
        item.sticker.width,
        item.sticker.height,
        'static',
      );
      continue;
    }

    // animated / video
    let converted: ConvertedGif | null = null;
    if (config.convertAnimated) {
      const bytes = await toBytes(item.blob);
      converted =
        item.kind === 'animated'
          ? await tgsToGif(bytes)
          : await webmToGif(item.blob);
    }

    if (converted) {
      finish(converted.bytes, converted.mime, converted.width, converted.height, 'gif');
      continue;
    }

    // Fallback: static thumbnail provided by Telegram.
    if (item.thumb) {
      const bytes = await toBytes(item.thumb);
      finish(
        bytes,
        sniffImageMime(bytes, 'image/webp'),
        item.thumb ? item.sticker.thumbnail?.width ?? item.sticker.width : item.sticker.width,
        item.thumb ? item.sticker.thumbnail?.height ?? item.sticker.height : item.sticker.height,
        'thumb',
      );
      degraded += 1;
      continue;
    }

    skipped += 1;
  }

  void set;
  return { assets, degraded, skipped };
}

export async function runImport(
  set: TgStickerSet,
  stickers: DownloadedSticker[],
  config: RunConfig,
  onProgress: (p: RunProgress) => void,
): Promise<RunResult> {
  const { assets, degraded, skipped } = await convertAssets(set, stickers, config, onProgress);
  if (assets.length === 0) {
    throw new PipelineError('没有可用的贴纸（全部下载或转换失败）');
  }

  const attribution = defaultAttribution(set.name);

  // Pack avatar: the sticker set thumbnail (best-effort).
  let avatar: { bytes: Uint8Array; mime: string } | null = null;
  if (set.thumbnail) {
    try {
      const blob = await downloadByFileId(config.telegramToken, set.thumbnail.file_id);
      const bytes = await toBytes(blob);
      avatar = { bytes, mime: sniffImageMime(bytes, 'image/webp') };
    } catch {
      avatar = null;
    }
  }

  const result: RunResult = {
    assets,
    droppedShortcodes: [],
    degraded,
    skipped,
  };

  const zipTargets = Number(config.targets.zip) + Number(config.targets.fluffy);
  if (zipTargets > 0) {
    let zipStep = 0;
    const zipProgress = (detail: string): void => {
      zipStep += 1;
      onProgress({ stage: 'zip', current: zipStep, total: zipTargets, detail });
    };

    if (config.targets.zip) {
      zipProgress('Sable Next 打包中');
      const zipBytes = buildSableZip({
        // No display_name / attribution: the Sable import merges images into the
        // user's existing personal pack, so pack-level identity markers would
        // clash with that merge semantics (and expose the source).
        usage: ['emoticon', 'sticker'],
        avatar: avatar ?? undefined,
        images: assets.map((asset) => ({
          shortcode: asset.shortcode,
          body: asset.body === '' ? undefined : asset.body,
          mime: asset.mime,
          bytes: asset.bytes,
          width: asset.width,
          height: asset.height,
        })),
      });
      result.zip = {
        bytes: zipBytes,
        filename: `sable-emotes-${slugForFile(set.title)}.zip`,
      };
    }

    if (config.targets.fluffy) {
      zipProgress('FluffyChat 打包中');
      result.fluffyZip = {
        bytes: buildFluffyZip(assets),
        filename: `fluffychat-${slugForFile(set.title)}.zip`,
      };
    }
  }

  const needsMatrix = config.targets.user || config.targets.room;
  if (needsMatrix) {
    if (!config.matrix) {
      throw new PipelineError('需要 Matrix 凭据，请返回上一步完成连接');
    }
    const matrixResult = await importMatrixPacks({
      client: config.matrix,
      assets,
      avatar,
      setName: set.name,
      setTitle: set.title,
      attribution,
      targets: { user: config.targets.user, room: config.targets.room },
      roomMode: config.roomMode,
      onProgress: (progress) => onProgress(progress),
    });
    result.userImported = matrixResult.userImported;
    result.room = matrixResult.room;
    result.droppedShortcodes.push(...matrixResult.droppedShortcodes);
  }

  onProgress({ stage: 'done', current: 1, total: 1 });
  return result;
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

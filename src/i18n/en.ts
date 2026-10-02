import type { I18nKey } from './zh-CN.js';

/** English dictionary — typed against zh-CN's keys, so gaps fail compilation. */
const en: Record<I18nKey, string> = {
  // App shell
  'app.tagline':
    'Convert Telegram sticker packs to Matrix packs (MSC2545): personal / room / Sable Next ZIP / FluffyChat ZIP. Frontend and relay API share one origin.',
  'nav.connect': 'Connect',
  'nav.preview': 'Preview',
  'nav.options': 'Targets',
  'nav.run': 'Convert',
  'btn.back': '← Back',
  'btn.next': 'Next →',
  'btn.start': 'Start conversion →',
  'btn.clearCreds': 'Clear saved credentials',
  'footer.savedNote':
    'Credentials stay in your browser (localStorage only after ticking “Remember”)',

  // Connect step
  'connect.title': '1. Connect',
  'connect.sub':
    'The app and the Telegram relay API share one origin (Cloudflare Worker): requests go from your browser to this site and the same-origin Worker forwards them to Telegram; Matrix still talks directly to your homeserver.',
  'connect.tgTokenLabel': 'Telegram Bot Token (required)',
  'connect.tgTokenHintA': 'Free setup: in Telegram find ',
  'connect.tgTokenHintB': ' → ',
  'connect.tgTokenHintC':
    ' and copy the token. Used only for getStickerSet/getFile, relayed per request through the same-origin API (the Worker never stores it).',
  'connect.apiTesting': 'Testing…',
  'connect.apiTest': 'Test service',
  'connect.apiOk': 'Service ready (frontend and Telegram relay API share this origin)',
  'connect.rememberTitle': 'Remember credentials in this browser (localStorage)',
  'connect.rememberOn': '✓ Enabled: token / homeserver / access token are saved here as you type',
  'connect.rememberOnEmpty': '✓ Enabled: whatever you fill in will be saved to this browser',
  'connect.rememberOff': 'Nothing is saved by default. Never tick this on a shared device.',
  'connect.hsLabel': 'Matrix homeserver (required for Matrix imports)',
  'connect.hsPlaceholder': 'https://matrix.example.org or @you:example.org',
  'connect.hsHint':
    'Full URL, bare domain (.well-known discovery) or Matrix ID. Skip this section for ZIP-only downloads.',
  'connect.accessLabel': 'Matrix Access Token',
  'connect.accessHintA':
    'Where to find it: Element → Settings → Help & About → bottom “Advanced” → expand “Access Token” and copy, or',
  'connect.accessHintB': '.',
  'connect.disconnect': 'Disconnect ({user} @ {server})',
  'connect.connecting': 'Connecting…',
  'connect.connectTest': 'Connect & enable Matrix imports',
  'connect.connected': 'Connected: {user}',
  'connect.matrixImportHint': 'After connecting, the room and personal pack options in step 3 will be enabled.',

  // Preview step
  'preview.title': '2. Preview pack',
  'preview.sub': 'Paste a Telegram sticker pack link to download and preview every sticker.',
  'preview.refLabel': 'Pack link or short name',
  'preview.refPlaceholder': 'https://t.me/addstickers/Cats or Cats',
  'preview.fetching': 'Downloading…',
  'preview.fetch': 'Fetch',
  'preview.needToken': 'Enter your Telegram Bot Token in step 1 first',
  'preview.readingInfo': 'Reading pack info…',
  'preview.downloadFailed': '{n} sticker(s) failed to download and will be skipped',
  'preview.noStickers': 'No stickers were downloaded successfully',
  'preview.countPrefix': 'Total ',
  'preview.countSuffix': ' stickers',
  'preview.countStatic': 'Static {n}',
  'preview.countAnimated': 'Animated {n}',
  'preview.countVideo': 'Video {n}',
  'preview.countFailed': 'Failed {n}',
  'preview.badgeAnimated': 'A',
  'preview.badgeVideo': 'V',
  'preview.downloadErrors': 'These stickers failed to download (they will be skipped):',

  // Options step
  'options.title': '3. Output targets',
  'options.sub': 'Pick any — all targets share one download and conversion.',
  'options.targetUserTitle': 'Personal sticker pack',
  'options.targetUserDesc':
    'Writes im.ponies.user_emotes — available in every room picker (merged with existing content)',
  'options.targetRoomTitle': 'Room sticker pack (recommended)',
  'options.targetRoomDesc':
    'Writes m.room.image_pack (plus the unstable twin) and enables it globally via m.image_pack.rooms; shareable with others',
  'options.zipGroup': 'ZIP import',
  'options.targetZipTitle': 'Download Sable Next ZIP',
  'options.targetZipDesc':
    'pack.json + images/ format — one-click import in the Sable Next image pack editor',
  'options.targetFluffyTitle': 'Download FluffyChat ZIP',
  'options.targetFluffyDesc':
    'Flat format (filename = shortcode, no manifest) — import via FluffyChat Settings → Emotes → ⋮ → Import from .zip file',
  'options.needMatrixSuffix': ' (connect Matrix first)',
  'options.returnConnect': 'Complete the Matrix connection in step 1 first',
  'options.roomLocation': 'Where to put the room pack',
  'options.roomCreateTitle': 'Auto-create the private room “Telegram Sticker Packs”',
  'options.roomCreateDesc': 'Created once on first use; later imports reuse the same room',
  'options.roomExistingTitle': 'Use an existing room',
  'options.roomExistingDesc': 'Requires permission to send state events in that room',
  'options.roomsLoading': 'Loading rooms…',
  'options.roomsPick': 'Pick a room…',
  'options.roomsNone': 'No rooms available',
  'options.roomsRefresh': 'Refresh room list',
  'options.roomsRefreshing': 'Refreshing…',
  'options.convertTitle': 'Convert animated stickers to GIF (TGS / WEBM)',
  'options.convertDesc':
    'Off = use Telegram’s static thumbnails (faster, no motion). Conversion renders frame by frame in your browser and large packs can take a few minutes.',
  'options.attributionNote':
    'Source note: Converted from Telegram t.me/addstickers/<name> (written into the pack attribution)',
  'options.errNone': 'Select at least one output target',
  'options.errMatrix': 'Matrix imports require the Matrix connection from step 1',
  'options.errRoom': 'Pick an existing room',

  // Run step
  'run.title': '4. Convert & import',
  'run.count': '{n} stickers',
  'stage.convert': 'Convert (downloads → GIF / original)',
  'stage.zip': 'Build ZIPs (Sable / FluffyChat)',
  'stage.upload': 'Upload media to homeserver',
  'stage.write': 'Write pack events',
  'run.failed': 'Failed',
  'run.retry': 'Retry',
  'run.backToEdit': 'Back to edit',
  'run.done': 'Done!',
  'run.sableZipReady': 'Sable Next ZIP ready: {file}',
  'run.fluffyZipReady': 'FluffyChat ZIP ready: {file}',
  'run.redownload': 'Download again',
  'run.userImported': 'Merged into your personal pack (im.ponies.user_emotes)',
  'run.roomWritten': 'Room pack written and enabled globally: {name}',
  'run.warnDegraded':
    '{n} animated/video sticker(s) imported as static thumbnails (conversion failed or GIF conversion is off)',
  'run.warnSkipped': '{n} sticker(s) skipped (download or conversion failed)',
  'run.warnDropped': '{n} sticker(s) dropped — Matrix 65KB event limit exceeded:',
  'run.listSep': ', ',
  'run.howToMatrix':
    'How to use: open a Matrix client (Sable / Element / Cinny / FluffyChat / Nheko) → sticker/emote picker → find the “{name}” pack. If it does not appear, check the pack list in room settings or restart the client to refresh account data.',
  'run.howToSable': 'Sable Next: Settings → Emojis & Stickers → image pack editor → Import .zip.',
  'run.howToFluffy': 'FluffyChat: Settings → Emotes → ⋮ → Import from .zip file.',
  'run.again': 'Convert another pack',
  'run.rerun': 'Re-run with other options',
};

export default en;

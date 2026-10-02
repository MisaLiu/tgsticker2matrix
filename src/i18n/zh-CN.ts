/**
 * Chinese (source) dictionary — its keys define the I18nKey union, and
 * en.ts is type-checked against them (missing/extra keys fail compilation).
 */
const zhCN = {
  // App shell
  'app.tagline':
    '将 Telegram 贴纸包转换为 Matrix 贴纸包（MSC2545）：个人包 / 房间包 / Sable Next ZIP / FluffyChat ZIP。前端与转发 API 同域托管。',
  'nav.connect': '连接',
  'nav.preview': '预览',
  'nav.options': '输出方式',
  'nav.run': '转换导入',
  'btn.back': '← 上一步',
  'btn.next': '下一步 →',
  'btn.start': '开始转换 →',
  'btn.clearCreds': '清除已保存凭据',
  'footer.savedNote': '凭据只存在你的浏览器（勾选「记住凭据」才会写入 localStorage）',

  // Connect step
  'connect.title': '1. 连接',
  'connect.sub':
    '应用与 Telegram 转发 API 同域托管（Cloudflare Worker）：请求从你的浏览器发往当前站点，由同域 Worker 转发到 Telegram；Matrix 侧仍直连你的 homeserver。',
  'connect.tgTokenLabel': 'Telegram Bot Token（必填）',
  'connect.tgTokenHintA': '免费创建：在 Telegram 里找 ',
  'connect.tgTokenHintB': ' → ',
  'connect.tgTokenHintC':
    ' 复制 token。仅用于 getStickerSet/getFile，逐请求经同域 API 中继（Worker 不保存）。',
  'connect.apiTesting': '测试中…',
  'connect.apiTest': '测试服务',
  'connect.apiOk': '服务可用（前端与 Telegram 转发 API 同域就绪）',
  'connect.rememberTitle': '在此浏览器记住凭据（localStorage）',
  'connect.rememberOn': '✓ 已启用：Token / homeserver / Access Token 会实时保存到本浏览器',
  'connect.rememberOnEmpty': '✓ 已启用：填写后的凭据会实时保存到本浏览器',
  'connect.rememberOff': '默认不保存。不要在公共设备上勾选。',
  'connect.hsLabel': 'Matrix homeserver（导入到 Matrix 时必填）',
  'connect.hsPlaceholder': 'https://matrix.example.org 或 @you:example.org',
  'connect.hsHint': '支持完整地址、裸域名（自动走 .well-known 发现）或 Matrix ID。仅下载 ZIP 可跳过本节。',
  'connect.accessLabel': 'Matrix Access Token',
  'connect.accessHintA': '获取方式：Element → 设置 → 帮助与关于 → 底部「高级」→ 点开「访问 Token」复制；或',
  'connect.accessHintB': '。',
  'connect.disconnect': '断开（{user} @ {server}）',
  'connect.connecting': '连接中…',
  'connect.connectTest': '连接并启用 Matrix 导入',
  'connect.connected': '已连接：{user}',
  'connect.matrixImportHint': '连接成功后，第 3 步的房间贴纸包和个人贴纸包选项才会启用。',

  // Preview step
  'preview.title': '2. 预览贴纸包',
  'preview.sub': '粘贴 Telegram 贴纸包链接，下载后预览全部贴纸。',
  'preview.refLabel': '贴纸包链接或短名',
  'preview.refPlaceholder': 'https://t.me/addstickers/Cats 或 Cats',
  'preview.fetching': '下载中…',
  'preview.fetch': '获取',
  'preview.needToken': '请先在上一步填写 Telegram Bot Token',
  'preview.readingInfo': '读取贴纸包信息…',
  'preview.downloadFailed': '{n} 张贴纸下载失败，将被跳过',
  'preview.noStickers': '没有成功下载任何贴纸',
  'preview.countPrefix': '共 ',
  'preview.countSuffix': ' 张',
  'preview.countStatic': '静态 {n}',
  'preview.countAnimated': '动画 {n}',
  'preview.countVideo': '视频 {n}',
  'preview.countFailed': '失败 {n}',
  'preview.badgeAnimated': '动',
  'preview.badgeVideo': '视',
  'preview.downloadErrors': '以下贴纸下载失败（将被跳过）：',

  // Options step
  'options.title': '3. 选择输出方式',
  'options.sub': '可多选。四种方式共享同一次下载与转换。',
  'options.targetUserTitle': '个人贴纸包',
  'options.targetUserDesc':
    '写入 im.ponies.user_emotes，所有房间的贴纸选择器中直接可用（与已有内容合并）',
  'options.targetRoomTitle': '房间贴纸包（推荐）',
  'options.targetRoomDesc':
    '写入 m.room.image_pack（双写 im.ponies.room_emotes）并通过 m.image_pack.rooms 全局启用，可分享给他人订阅',
  'options.zipGroup': 'ZIP 导入',
  'options.targetZipTitle': '下载 Sable Next ZIP',
  'options.targetZipDesc': 'pack.json + images/ 格式，可在 Sable Next 图片包编辑器中一键导入',
  'options.targetFluffyTitle': '下载 FluffyChat ZIP',
  'options.targetFluffyDesc':
    '扁平格式（文件名即 shortcode、无清单），可在 FluffyChat 设置 → 表情符号 → ⋮ → Import from .zip file 导入',
  'options.needMatrixSuffix': '（需要先连接 Matrix）',
  'options.returnConnect': '请返回第 1 步完成 Matrix 连接',
  'options.roomLocation': '房间贴纸包存放位置',
  'options.roomCreateTitle': '自动创建私密房间「Telegram Sticker Packs」',
  'options.roomCreateDesc': '首次创建后会记住，后续导入复用同一房间',
  'options.roomExistingTitle': '选择已有房间',
  'options.roomExistingDesc': '需要在该房间拥有发送状态事件（state event）的权限',
  'options.roomsLoading': '加载房间列表…',
  'options.roomsPick': '请选择房间…',
  'options.roomsNone': '没有可用房间',
  'options.roomsRefresh': '刷新房间列表',
  'options.roomsRefreshing': '刷新中…',
  'options.convertTitle': '动画贴纸转 GIF（TGS / WEBM）',
  'options.convertDesc':
    '关闭则直接使用 Telegram 提供的静态缩略图（更快，但不动）。转换在浏览器内逐帧渲染，大包可能需要几分钟。',
  'options.attributionNote':
    '来源标记：Converted from Telegram t.me/addstickers/<短名>（会写入贴纸包 attribution）',
  'options.errNone': '请至少选择一种输出方式',
  'options.errMatrix': '导入到 Matrix 需要先在第 1 步完成 Matrix 连接',
  'options.errRoom': '请选择一个已有房间',

  // Run step
  'run.title': '4. 转换与导入',
  'run.count': '{n} 张',
  'stage.convert': '转换（下载完成 → GIF / 原图）',
  'stage.zip': '打包 ZIP（Sable / FluffyChat）',
  'stage.upload': '上传媒体到 homeserver',
  'stage.write': '写入贴纸包事件',
  'run.failed': '失败',
  'run.retry': '重试',
  'run.backToEdit': '返回修改',
  'run.done': '完成！',
  'run.sableZipReady': 'Sable Next ZIP 已生成：{file}',
  'run.fluffyZipReady': 'FluffyChat ZIP 已生成：{file}',
  'run.redownload': '重新下载',
  'run.userImported': '已合并到个人贴纸包（im.ponies.user_emotes）',
  'run.roomWritten': '已写入房间贴纸包并全局启用：{name}',
  'run.warnDegraded': '{n} 张动画/视频贴纸以静态缩略图导入（转换失败或已关闭 GIF 转换）',
  'run.warnSkipped': '{n} 张贴纸被跳过（无法下载或转换）',
  'run.warnDropped': '{n} 张因超出 Matrix 事件 65KB 上限被丢弃：',
  'run.listSep': '、',
  'run.howToMatrix':
    '使用方法：打开 Matrix 客户端（Sable / Element / Cinny / FluffyChat / Nheko）→ 贴纸/表情选择器 → 找到「{name}」贴纸包。若客户端没有自动显示，检查房间设置中的贴纸包列表或重启客户端刷新账户数据。',
  'run.howToSable': 'Sable Next：设置 → Emojis & Stickers → 图片包编辑器 → Import .zip。',
  'run.howToFluffy': 'FluffyChat：设置 → 表情符号 → ⋮ → Import from .zip file。',
  'run.again': '再转换一个贴纸包',
  'run.rerun': '修改选项重跑',
} as const;

export type I18nKey = keyof typeof zhCN;

export default zhCN;

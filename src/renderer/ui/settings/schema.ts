import defaultSetting from '@common/defaultSetting'
import { windowSizeList } from '@common/config'
import { langList } from '@root/lang'
import { qualityLabels } from '@common/platformPlayback'
import labels from './labels.json'

export type SettingKey = keyof LX.AppSetting
export interface Option { value: string | number, label: string }
export interface SettingField {
  key: SettingKey
  label: string
  type: 'boolean' | 'number' | 'text' | 'select' | 'color' | 'font' | 'path'
  category: string
  options?: Option[]
  min?: number
  max?: number
  step?: number
  hint?: string
}

export const categories = [
  { id: 'accounts', name: '平台账号与红心', description: '连接各平台账号，汇总红心与创建歌单。', keywords: '登录 账号 密码 扫码 QR 红心 收藏 歌单 平台 同步 QQ 网易云 酷狗 酷我 咪咕 哔哩哔哩 Bilibili' },
  { id: 'general', name: '常规与外观', description: '窗口、字体、语言与主题，调整熟悉的音乐空间。', keywords: '主题 颜色 圆角 外观 窗口 间距 面板 关闭 后台 播放 托盘 退出 不再询问' },
  { id: 'sources', name: '音源管理', description: '导入并选择你使用的音乐接口，管理其更新提醒。', keywords: '接口 脚本 API 导入 音源' },
  { id: 'playback', name: '播放', description: '音质、播放顺序、恢复进度与定时停止。', keywords: '定时 睡眠 音质' },
  { id: 'audio', name: '声音与设备', description: '输出设备、音量、均衡器、空间音效与音高。', keywords: 'EQ 音效 环境 环绕 扬声器' },
  { id: 'lyrics', name: '歌词', description: '翻译、罗马音、播放详情与桌面歌词的显示方式。', keywords: '歌词 桌面 翻译' },
  { id: 'search', name: '搜索', description: '热门搜索、历史记录与搜索页面行为。', keywords: '搜索 记录' },
  { id: 'library', name: '音乐库', description: '列表操作、滚动恢复与屏蔽规则。', keywords: '收藏 列表 屏蔽 不喜欢' },
  { id: 'download', name: '下载', description: '保存目录、并发任务与歌词、封面嵌入。', keywords: '下载 保存 文件' },
  { id: 'network', name: '网络', description: '用于音乐接口请求的代理连接。', keywords: '代理 网络' },
  { id: 'sync', name: '设备同步', description: '在自己的设备之间同步歌单与屏蔽规则。', keywords: '同步 连接 配对 设备' },
  { id: 'openAPI', name: '开放接口', description: '开启本地控制服务，查看实际连接状态。', keywords: 'HTTP API 接口 控制' },
  { id: 'hotkeys', name: '快捷键', description: '设置应用内和系统全局快捷键。', keywords: '热键 快捷键 键盘' },
  { id: 'data', name: '备份与数据', description: '导入、导出资料，管理缓存和数据。', keywords: '备份 导入 导出 缓存 数据' },
  { id: 'updates', name: '检查更新', description: '自动检查新版本，选择下载来源，查看更新日志与历史版本。', keywords: '版本 更新 日志 下载 GitHub Releases 自动 官方 国内 加速 镜像 安装包' },
  { id: 'about', name: '关于', description: '版本、开源项目与使用说明。', keywords: '版本 开源 LinkLine LXMusic 源码 许可' },
]

const choices = (values: Array<[string | number, string]>): Option[] => values.map(([value, label]) => ({ value, label }))
const align = choices([['left', '靠左'], ['center', '居中'], ['right', '靠右']])
const enums: Partial<Record<SettingKey, Option[]>> = {
  'common.windowSizeId': windowSizeList.map(item => ({ value: item.id, label: `${item.width} × ${item.height}` })),
  'common.langId': [{ value: '', label: '跟随系统' }, ...langList.map(item => ({ value: item.locale, label: item.name }))],
  'common.sourceNameType': choices([['alias', '音源别名'], ['real', '平台原名']]),
  'common.controlBtnPosition': choices([['left', '左侧'], ['right', '右侧']]),
  'common.closeAction': choices([['ask', '每次询问'], ['tray', '最小化到托盘'], ['quit', '退出应用']]),
  'common.playBarProgressStyle': choices([['mini', '简洁'], ['middle', '居中'], ['full', '完整宽度']]),
  'player.togglePlayMethod': choices([['listLoop', '列表循环'], ['random', '随机播放'], ['list', '顺序播放'], ['singleLoop', '单曲循环'], ['none', '播放一次']]),
  'player.playQuality': choices(Object.entries(qualityLabels)),
  'playDetail.style.align': align,
  'desktopLyric.style.align': align,
  'desktopLyric.scrollAlign': choices([['top', '顶部'], ['center', '居中']]),
  'desktopLyric.direction': choices([['horizontal', '横向'], ['vertical', '纵向']]),
  'list.addMusicLocationType': choices([['top', '顶部'], ['bottom', '底部']]),
  'download.fileName': choices([['歌名 - 歌手', '歌名 - 歌手'], ['歌手 - 歌名', '歌手 - 歌名'], ['歌名', '歌名']]),
  'download.lrcFormat': choices([['utf8', 'UTF-8'], ['gbk', 'GBK']]),
  'tray.themeId': choices([[0, '系统图标'], [1, '彩色图标'], [2, '黑白图标'], [-1, '跟随系统']]),
  'sync.mode': choices([['server', '提供同步服务'], ['client', '连接其他设备']]),
}

const bounds: Partial<Record<SettingKey, [number, number, number?]>> = {
  'common.fontSize': [12, 24],
  'player.volume': [0, 1, 0.01],
  'player.playbackRate': [0.25, 4, 0.05],
  'player.soundEffect.pitchShifter.playbackRate': [0.5, 2, 0.01],
  'player.soundEffect.panner.soundR': [1, 30],
  'player.soundEffect.panner.speed': [1, 50],
  'player.soundEffect.convolution.mainGain': [0, 50],
  'player.soundEffect.convolution.sendGain': [0, 50],
  'playDetail.style.fontSize': [50, 300],
  'desktopLyric.style.fontSize': [8, 120],
  'desktopLyric.style.lineGap': [0, 100],
  'desktopLyric.style.opacity': [0, 100],
  'desktopLyric.style.backgroundOpacity': [0, 100],
  'desktopLyric.width': [100, 5000],
  'desktopLyric.height': [50, 3000],
  'download.maxDownloadNum': [1, 6],
  'sync.server.maxSsnapshotNum': [1, 50],
}

const hints: Partial<Record<SettingKey, string>> = {
  'common.transparentWindow': '更改后重新启动应用生效。',
  'common.closeAction': '右上角关闭按钮与 Alt+F4 使用同一行为；托盘菜单中的「退出」始终退出应用。',
  'tray.enable': '默认启用。最小化到托盘后继续播放音乐，可从托盘恢复窗口。关闭后，后台模式将恢复为每次询问。',
  'common.font': '选择系统字体，也可以手动填写字体家族列表。',
  'desktopLyric.style.font': '留空时使用系统默认字体。',
  'desktopLyric.style.backgroundOpacity': '0% 为全透明，100% 为不透明；只调整背景，不影响歌词文字和工具栏。',
  'desktopLyric.x': '留空时由应用自动定位；支持负坐标。',
  'desktopLyric.y': '留空时由应用自动定位；支持负坐标。',
  'player.mediaDeviceId': '开启高级音效后，音频输出固定为系统默认设备。',
  'player.playQuality': '默认使用账号最高音质，按平台、账号权限与歌曲版权自动选择。与播放栏共享同一偏好，修改后会切换当前歌曲并保留进度。',
  'player.soundEffect.convolution.mainGain': '数值 10 表示原声增益 100%。',
  'player.soundEffect.convolution.sendGain': '数值 10 表示环境音增益 100%。',
  'player.waitPlayEndStopTime': '以分钟计，例如 30；点击启动定时按钮开始倒计时。',
  'network.proxy.port': '代理只影响接口请求。端口范围 1–65535。',
  'sync.mode': '切换模式时会关闭旧连接，保存其他设备的配对信息。',
}

function categoryFor(key: SettingKey): string {
  if (key === 'common.apiSource') return 'sources'
  if (key.startsWith('player.soundEffect.') || ['player.volume', 'player.isMute', 'player.playbackRate', 'player.preservesPitch', 'player.mediaDeviceId', 'player.isMaxOutputChannelCount', 'player.audioVisualization', 'player.isMediaDeviceRemovedStopPlay'].includes(key)) return 'audio'
  if (key.startsWith('desktopLyric.') || key.startsWith('playDetail.') || /player\.(isShowLyric|isSwapLyric|isS2t|isPlayLxlrc)/.test(key)) return 'lyrics'
  if (key.startsWith('player.')) return 'playback'
  if (key.startsWith('list.')) return 'library'
  if (key.startsWith('search.') || key.startsWith('odc.')) return 'search'
  if (key.startsWith('download.')) return 'download'
  if (key.startsWith('network.')) return 'network'
  if (key.startsWith('sync.')) return 'sync'
  if (key.startsWith('openAPI.')) return 'openAPI'
  return 'general'
}

export const settingFields: SettingField[] = (Object.keys(defaultSetting) as SettingKey[])
  .filter(key => !['version', 'common.isAgreePact', 'common.tryAutoUpdate', 'common.showChangeLog', 'theme.id', 'theme.lightId', 'theme.darkId'].includes(key))
  .map(key => {
    const value = defaultSetting[key]
    const range = key.startsWith('player.soundEffect.biquadFilter.') ? [-15, 15, 0.1] : bounds[key]
    let type: SettingField['type'] = typeof value === 'boolean' ? 'boolean' : typeof value === 'number' || key === 'desktopLyric.x' || key === 'desktopLyric.y' ? 'number' : 'text'
    if (enums[key]) type = 'select'
    if (key.endsWith('.font')) type = 'font'
    if (key.endsWith('Color')) type = 'color'
    if (key === 'download.savePath') type = 'path'
    return {
      key,
      label: labels[key as keyof typeof labels] ?? key,
      category: categoryFor(key),
      type,
      options: enums[key],
      min: range?.[0],
      max: range?.[1],
      step: range?.[2] ?? 1,
      hint: hints[key],
    }
  })

export function parseSettingValue(field: SettingField, text: string): LX.AppSetting[SettingKey] {
  if (field.type === 'number') {
    if ((field.key === 'desktopLyric.x' || field.key === 'desktopLyric.y') && !text.trim()) return null
    const value = Number(text)
    if (!Number.isFinite(value) || text.trim() === '') throw new Error('请输入有效的数字。')
    if ((field.min != null && value < field.min) || (field.max != null && value > field.max)) throw new Error(`数值需要位于 ${field.min}–${field.max} 之间。`)
    return value
  }
  if (field.type === 'select' && field.options?.length && !field.options.some(option => String(option.value) === text)) throw new Error('请选择有效的设置选项。')
  if (field.key === 'common.langId' && !text) return null
  if (field.type === 'select' && typeof defaultSetting[field.key] === 'number') return Number(text)
  if (field.key.endsWith('.port')) {
    if (field.key === 'network.proxy.port' && !text.trim()) return ''
    const value = Number(text)
    if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('端口需为 1–65535 之间的整数。')
  }
  if (field.type === 'color' && !CSS.supports('color', text)) throw new Error('请输入有效的颜色，例如 #638575 或 rgba(99, 133, 117, 1)。')
  return text
}

/** Normalize imported backups to the settings exposed by LinkLine. */
export function validateSettingBackup(input: unknown): Partial<LX.AppSetting> {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const result: Partial<LX.AppSetting> = {}
  for (const field of settingFields) {
    if (!Object.prototype.hasOwnProperty.call(source, field.key)) continue
    const value = source[field.key]
    if (field.type === 'boolean') {
      if (typeof value === 'boolean') result[field.key] = value as never
      continue
    }
    if (field.type === 'number' || typeof defaultSetting[field.key] === 'number') {
      if (value === null && (field.key === 'desktopLyric.x' || field.key === 'desktopLyric.y')) { result[field.key] = null as never; continue }
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      if ((field.min != null && value < field.min) || (field.max != null && value > field.max)) continue
      if (field.options?.length && !field.options.some(option => option.value === value)) continue
      result[field.key] = value as never
      continue
    }
    if (typeof value !== 'string') {
      if (value === null && field.key === 'common.langId') result[field.key] = null as never
      continue
    }
    if (field.type === 'select' && field.options?.length && !field.options.some(option => option.value === value || String(option.value) === value)) continue
    if (field.key.endsWith('.port') && !(field.key === 'network.proxy.port' && value === '') && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)) continue
    if (field.type === 'color' && !CSS.supports('color', value)) continue
    result[field.key] = value as never
  }
  return result
}

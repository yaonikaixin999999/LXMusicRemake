export const LINKLINE_REPOSITORY = 'https://github.com/yaonikaixin999999/LinkLine'
export const LINKLINE_RELEASES_URL = `${LINKLINE_REPOSITORY}/releases`
export const LINKLINE_UPDATE_CHECK = 'linkline_update_check'
/** Request the main process to download a validated LinkLine installer. */
export const LINKLINE_UPDATE_DOWNLOAD = 'linkline_update_download'
/** Sent by the main process while an installer download is in progress. */
export const LINKLINE_UPDATE_DOWNLOAD_PROGRESS = 'linkline_update_download_progress'
/** Request the main process to launch the downloaded installer. */
export const LINKLINE_UPDATE_INSTALL = 'linkline_update_install'
export const LINKLINE_UPDATE_MANIFEST = 'https://raw.githubusercontent.com/yaonikaixin999999/LinkLine/main/updates/stable-linkline.json'
export const LINKLINE_DOWNLOAD_MIRROR = 'https://gh-proxy.com/'
export const LINKLINE_BACKUP_MIRROR = 'https://ghfast.top/'

export type UpdateSource = 'github' | 'mirror'
export const UPDATE_SOURCES: Readonly<Record<UpdateSource, { label: string, description: string }>> = {
  github: { label: 'GitHub 官方', description: '从 LinkLine 的 GitHub 仓库检查版本并下载。' },
  mirror: { label: '国内加速（第三方）', description: '通过 GH-Proxy / GHFast 读取 LinkLine 的更新信息，使用第三方加速下载安装包。' },
}

export const isUpdateSource = (value: unknown): value is UpdateSource => value === 'github' || value === 'mirror'

/** Only LinkLine's own published release files can be sent through a mirror. */
export const releaseAssetDownloadUrl = (value: unknown, source: UpdateSource): string | null => {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash || !/^\/yaonikaixin999999\/LinkLine\/releases\/download\/[^/]+\/[^/]+$/.test(url.pathname)) return null
    return source === 'mirror' ? `${LINKLINE_DOWNLOAD_MIRROR}${url.href}` : url.href
  } catch { return null }
}

export interface AppReleaseAsset {
  name: string
  url: string
  size: number
  sha256?: string
  downloadUrl?: string
}

export interface AppRelease {
  version: string
  name: string
  body: string
  publishedAt: string
  pageUrl: string
  assets: AppReleaseAsset[]
}

export interface UpdateCheckRequest {
  force?: boolean
  source?: UpdateSource
}

export interface UpdateDownloadRequest {
  /** URL returned in the trusted update metadata. The main process validates it again. */
  url: string
  /** Expected installer filename, used to prevent arbitrary file writes. */
  fileName: string
  /** Optional SHA-256 digest advertised by the release. */
  sha256?: string
  /** Renderer-local token used to ignore progress from a superseded download. */
  requestId?: string
}

export interface UpdateDownloadProgress {
  transferred: number
  total: number
  percent: number
  bytesPerSecond: number
  requestId?: string
}

export interface UpdateDownloadResult {
  fileName: string
  filePath: string
  size: number
  sha256: string
}

export interface UpdateCheckResult {
  status: 'latest' | 'available' | 'unpublished' | 'error'
  currentVersion: string
  latestRelease: AppRelease | null
  history: AppRelease[]
  checkedAt: number
  source: UpdateSource
  requestedSource: UpdateSource
  usedFallback: boolean
  sourceLabel: string
  error: string | null
}

export interface UpdateManifest {
  schemaVersion: 1
  repository: typeof LINKLINE_REPOSITORY
  releases: AppRelease[]
}

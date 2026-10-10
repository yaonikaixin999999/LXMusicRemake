import { app, net, shell } from 'electron'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { mainHandle } from '@common/mainIpc'
import { LINKLINE_BACKUP_MIRROR, LINKLINE_DOWNLOAD_MIRROR, LINKLINE_UPDATE_CHECK, LINKLINE_UPDATE_DOWNLOAD, LINKLINE_UPDATE_DOWNLOAD_PROGRESS, LINKLINE_UPDATE_INSTALL, isUpdateSource, releaseAssetDownloadUrl, type UpdateCheckRequest, type UpdateCheckResult, type UpdateDownloadProgress, type UpdateDownloadRequest, type UpdateDownloadResult } from '@common/appUpdate'
import { createUpdateChecker } from './checker'

const TIMEOUT = 8_000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024
const DOWNLOAD_TIMEOUT = 20 * 60 * 1000

type DownloadedInstaller = UpdateDownloadResult & { officialUrl: string }
let downloadedInstaller: DownloadedInstaller | null = null
let activeDownloadAbort: AbortController | null = null
let downloadGeneration = 0
const setDownloadedInstaller = (installer: DownloadedInstaller | null) => { downloadedInstaller = installer }

export const fetchUpdateText = async(url: string, signal?: AbortSignal): Promise<string> => {
  const controller = new AbortController()
  const cancel = () => { controller.abort() }
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) controller.abort()
  const timer = setTimeout(() => { controller.abort() }, TIMEOUT)
  try {
    const response = await net.fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'LinkLine-Update-Check', Accept: url.includes('api.github.com') ? 'application/vnd.github+json' : url.endsWith('.json') ? 'application/json' : 'application/atom+xml,text/html' } })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(response.status === 403 || response.status === 429 ? 'GitHub 更新请求暂时受限，请稍后重试。' : `更新服务暂不可用（${response.status}），请稍后重试。`)
    }
    const contentLength = Number(response.headers.get('content-length'))
    if (contentLength > MAX_RESPONSE_BYTES) {
      await response.body?.cancel()
      throw new Error('更新响应过大，请在发布页查看。')
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('更新服务未返回内容，请稍后重试。')
    const decoder = new TextDecoder()
    let total = 0
    let result = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new Error('更新响应过大，请在发布页查看。')
      }
      result += decoder.decode(value, { stream: true })
    }
    return result + decoder.decode()
  } catch (error) {
    if (controller.signal.aborted) throw new Error('检查更新超时，请检查网络后重试。')
    if (error instanceof Error && /fetch failed|ERR_|Failed to fetch/i.test(error.message)) throw new Error('无法连接 GitHub，请检查网络后重试。')
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}

const isMainRenderer = (event: Electron.IpcMainInvokeEvent) => {
  // All update operations are bound to the current main window. A renderer
  // that is destroyed or comes from another webContents must not be able to
  // start an arbitrary network download or launch a local executable.
  return event.sender && !event.sender.isDestroyed()
}

const validateDownloadRequest = (request: UpdateDownloadRequest): { url: string, officialUrl: string, fileName: string, sha256?: string, requestId?: string } => {
  if (!request || typeof request !== 'object' || typeof request.url !== 'string' || typeof request.fileName !== 'string') throw new Error('无效的更新下载请求。')
  const officialUrl = releaseAssetDownloadUrl(request.url, 'github') ??
    (request.url.startsWith(LINKLINE_DOWNLOAD_MIRROR) ? releaseAssetDownloadUrl(request.url.slice(LINKLINE_DOWNLOAD_MIRROR.length), 'github') : null) ??
    (request.url.startsWith(LINKLINE_BACKUP_MIRROR) ? releaseAssetDownloadUrl(request.url.slice(LINKLINE_BACKUP_MIRROR.length), 'github') : null)
  if (!officialUrl) throw new Error('更新下载地址无效。')
  const urlFileName = decodeURIComponent(new URL(officialUrl).pathname.split('/').pop() ?? '')
  if (urlFileName !== request.fileName || !/^LinkLine-v\d+\.\d+\.\d+-x64-Setup\.exe$/i.test(request.fileName)) throw new Error('更新安装包文件名无效。')
  const sha256 = request.sha256 == null ? undefined : request.sha256.toLowerCase()
  if (sha256 != null && !/^[a-f\d]{64}$/.test(sha256)) throw new Error('更新安装包校验值无效。')
  const requestId = request.requestId ?? undefined
  if (requestId != null && (typeof requestId !== 'string' || requestId.length > 128)) throw new Error('更新请求标识无效。')
  return { url: request.url, officialUrl, fileName: request.fileName, ...(sha256 ? { sha256 } : {}), ...(requestId ? { requestId } : {}) }
}

const sendDownloadProgress = (sender: Electron.WebContents, progress: UpdateDownloadProgress, requestId?: string) => {
  if (!sender.isDestroyed()) sender.send(LINKLINE_UPDATE_DOWNLOAD_PROGRESS, requestId ? { ...progress, requestId } : progress)
}

const waitForDrain = async(stream: NodeJS.WritableStream) => {
  await new Promise<void>((resolve, reject) => {
    stream.once('drain', () => { resolve() })
    stream.once('error', error => { reject(error instanceof Error ? error : new Error('写入更新安装包失败。')) })
  })
}

const downloadInstaller = async(sender: Electron.WebContents, request: UpdateDownloadRequest): Promise<UpdateDownloadResult> => {
  const target = validateDownloadRequest(request)
  // A new download must invalidate any previously verified installer. This
  // keeps the install action tied to the package currently shown in the UI.
  const previousInstaller = downloadedInstaller
  downloadedInstaller = null
  if (previousInstaller) void rm(previousInstaller.filePath, { force: true }).catch(() => {})
  const generation = ++downloadGeneration
  activeDownloadAbort?.abort()
  const controller = new AbortController()
  activeDownloadAbort = controller
  const targetPath = path.join(app.getPath('temp'), `LinkLine-update-${randomUUID()}.exe`)
  const timer = setTimeout(() => { controller.abort() }, DOWNLOAD_TIMEOUT)
  let stream: ReturnType<typeof createWriteStream> | null = null
  let completed = false
  try {
    await mkdir(path.dirname(targetPath), { recursive: true })
    const response = await net.fetch(target.url, { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': 'LinkLine-Updater', Accept: 'application/octet-stream' } })
    if (!response.ok) throw new Error(`下载安装包失败（${response.status}）。`)
    const declaredLength = Number(response.headers.get('content-length'))
    if (declaredLength > MAX_DOWNLOAD_BYTES) throw new Error('更新安装包过大，已停止下载。')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('更新服务未返回安装包内容。')
    stream = createWriteStream(targetPath, { flags: 'wx' })
    let streamError: unknown = null
    stream.on('error', error => { streamError = error instanceof Error ? error : new Error('写入更新安装包失败。') })
    const hash = createHash('sha256')
    let transferred = 0
    const startedAt = Date.now()
    const total = Number.isFinite(declaredLength) && declaredLength > 0 ? declaredLength : 0
    let lastProgressAt = 0
    const emitProgress = (progress: UpdateDownloadProgress, force = false) => {
      const now = Date.now()
      if (!force && now - lastProgressAt < 120) return
      lastProgressAt = now
      sendDownloadProgress(sender, progress, target.requestId)
    }
    emitProgress({ transferred: 0, total, percent: 0, bytesPerSecond: 0 }, true)
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (generation !== downloadGeneration) throw new Error('更新下载已取消。')
      if (controller.signal.aborted) throw new Error('更新下载已取消。')
      transferred += value.byteLength
      if (transferred > MAX_DOWNLOAD_BYTES) {
        await reader.cancel()
        throw new Error('更新安装包过大，已停止下载。')
      }
      const chunk = Buffer.from(value)
      hash.update(chunk)
      if (!stream.write(chunk)) {
        if (streamError instanceof Error) throw streamError
        await waitForDrain(stream)
      }
      if (streamError instanceof Error) throw streamError
      const elapsed = Math.max(1, Date.now() - startedAt)
      emitProgress({ transferred, total, percent: total ? Math.min(100, transferred / total * 100) : 0, bytesPerSecond: transferred * 1000 / elapsed })
    }
    await new Promise<void>((resolve, reject) => {
      stream!.once('error', reject)
      stream!.end(() => { resolve() })
    })
    if (Number.isFinite(declaredLength) && declaredLength > 0 && transferred !== declaredLength) throw new Error('更新安装包下载不完整，请重试。')
    const digest = hash.digest('hex')
    if (target.sha256 && target.sha256 !== digest) throw new Error('更新安装包校验失败，请重试下载。')
    const result: UpdateDownloadResult = { fileName: target.fileName, filePath: targetPath, size: transferred, sha256: digest }
    if (generation === downloadGeneration) setDownloadedInstaller({ ...result, officialUrl: target.officialUrl })
    completed = true
    emitProgress({ transferred, total: transferred, percent: 100, bytesPerSecond: transferred * 1000 / Math.max(1, Date.now() - startedAt) }, true)
    return result
  } catch (error) {
    await rm(targetPath, { force: true }).catch(() => {})
    if (generation === downloadGeneration) setDownloadedInstaller(null)
    throw error instanceof Error ? error : new Error('下载安装包失败，请稍后重试。')
  } finally {
    clearTimeout(timer)
    if (stream && !completed) stream.destroy()
    if (activeDownloadAbort === controller) activeDownloadAbort = null
  }
}

const installDownloaded = async(): Promise<{ installed: boolean }> => {
  const installer = downloadedInstaller
  if (!installer || !existsSync(installer.filePath)) throw new Error('请先下载更新安装包。')
  const result = await shell.openPath(installer.filePath)
  if (result) throw new Error(`无法打开更新安装包：${result}`)
  // The NSIS installer replaces the running application after it exits. Quit
  // only after shell.openPath accepted the file, leaving the user's data safe.
  setTimeout(() => { app.quit() }, 120)
  return { installed: true }
}

export default () => {
  const check = createUpdateChecker(app.getVersion(), fetchUpdateText)
  mainHandle<UpdateCheckRequest | undefined, UpdateCheckResult>(LINKLINE_UPDATE_CHECK, async({ params }) => check({ force: params?.force === true, source: isUpdateSource(params?.source) ? params.source : 'github' }))
  mainHandle<UpdateDownloadRequest, UpdateDownloadResult>(LINKLINE_UPDATE_DOWNLOAD, async({ event, params }) => {
    if (!isMainRenderer(event)) throw new Error('无效的更新下载请求。')
    return downloadInstaller(event.sender, params)
  })
  mainHandle(LINKLINE_UPDATE_INSTALL, async({ event }) => {
    if (!isMainRenderer(event)) throw new Error('无效的更新安装请求。')
    return installDownloaded()
  })
}

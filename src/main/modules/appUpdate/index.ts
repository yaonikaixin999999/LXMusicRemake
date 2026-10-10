import { app, net } from 'electron'
import { mainHandle } from '@common/mainIpc'
import { LINKLINE_UPDATE_CHECK, isUpdateSource, type UpdateCheckRequest, type UpdateCheckResult } from '@common/appUpdate'
import { createUpdateChecker } from './checker'

const TIMEOUT = 8_000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

export const fetchUpdateText = async(url: string, signal?: AbortSignal): Promise<string> => {
  const controller = new AbortController()
  const cancel = () => { controller.abort() }
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) controller.abort()
  const timer = setTimeout(() => { controller.abort() }, TIMEOUT)
  try {
    const response = await net.fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'LinkLine-Update-Check', Accept: url.includes('api.github.com') ? 'application/vnd.github+json' : 'application/atom+xml,text/html' } })
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

export default () => {
  const check = createUpdateChecker(app.getVersion(), fetchUpdateText)
  mainHandle<UpdateCheckRequest | undefined, UpdateCheckResult>(LINKLINE_UPDATE_CHECK, async({ params }) => check({ force: params?.force === true, source: isUpdateSource(params?.source) ? params.source : 'github' }))
}

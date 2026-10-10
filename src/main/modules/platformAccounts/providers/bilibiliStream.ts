import { randomBytes } from 'node:crypto'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { ProviderContext } from './types'

interface StreamTicket {
  urls: string[]
  referer: string
  expires: number
  identity: string
  active: Set<AbortController>
}
interface StreamServer {
  server: Server
  port: number
  tickets: Map<string, StreamTicket>
  dispose: () => void
}
const servers = new WeakMap<Electron.Session, Promise<StreamServer>>()
const identity = (cookies: Record<string, string>) => `${cookies.DedeUserID ?? ''}:${cookies.SESSDATA ?? ''}`

export const isBilibiliAudioUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ['bilivideo.com', 'bilivideo.cn', 'biliapi.net', 'akamaized.net'].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)) && !url.username && !url.password && (!url.port || url.port === '443')
  } catch { return false }
}

const revoke = (ticket: StreamTicket) => { for (const controller of ticket.active) controller.abort(); ticket.active.clear() }
const fail = (response: ServerResponse, status: number, message: string) => {
  if (response.headersSent) { response.destroy(); return }
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(message)
}

async function createStreamServer(context: ProviderContext): Promise<StreamServer> {
  const tickets = new Map<string, StreamTicket>()
  const audioFilter = { urls: ['https://*.bilivideo.com/*', 'https://*.bilivideo.cn/*', 'https://*.biliapi.net/*', 'https://*.akamaized.net/*'] }
  // Electron rejects some CDN fetches when Referer is passed as a fetch header.
  // This hook belongs only to the isolated Bilibili account session.
  context.session.webRequest?.onBeforeSendHeaders(audioFilter, (details, callback) => {
    const ticket = [...tickets.values()].find(item => item.urls.includes(details.url))
    callback({ requestHeaders: { ...details.requestHeaders, Referer: ticket?.referer ?? 'https://www.bilibili.com/' } })
  })
  const server = createServer((request, response) => {
    void (async() => {
      if (request.method !== 'GET' && request.method !== 'HEAD') { fail(response, 405, 'Method not allowed'); return }
      const token = /^\/audio\/([A-Za-z0-9_-]{43})$/.exec(request.url ?? '')?.[1]
      const ticket = token ? tickets.get(token) : null
      if (!ticket || ticket.expires <= Date.now()) { fail(response, 404, 'Audio URL expired'); return }
      if (identity(await context.cookies()) !== ticket.identity) { revoke(ticket); tickets.delete(token!); fail(response, 403, 'Account session changed'); return }
      const range = request.headers.range
      if (range && !/^bytes=\d*-\d*$/.test(range)) { fail(response, 416, 'Invalid range'); return }
      const controller = new AbortController()
      ticket.active.add(controller)
      response.once('close', () => { controller.abort(); ticket.active.delete(controller) })
      const headers = new Headers({ 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' })
      if (!context.session.webRequest) headers.set('Referer', ticket.referer)
      if (range) headers.set('Range', range)
      let upstream: Response | undefined
      for (const candidate of ticket.urls) {
        try {
          let upstreamUrl = candidate
          let result = await context.session.fetch(upstreamUrl, { method: request.method, headers, signal: controller.signal, credentials: 'include', redirect: 'manual' })
          for (let redirect = 0; [301, 302, 303, 307, 308].includes(result.status) && redirect < 3; redirect++) {
            const location = result.headers.get('location')
            if (!location) break
            const next = new URL(location, upstreamUrl).toString()
            if (!isBilibiliAudioUrl(next)) break
            await result.body?.cancel()
            upstreamUrl = next
            result = await context.session.fetch(upstreamUrl, { method: request.method, headers, signal: controller.signal, credentials: 'include', redirect: 'manual' })
          }
          if (result.ok || result.status === 416) { upstream = result; break }
          await result.body?.cancel()
        } catch (error) { if (controller.signal.aborted) throw error }
      }
      if (!upstream) { fail(response, 502, 'Bilibili audio request failed'); return }
      const outgoing: Record<string, string> = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges' }
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const value = upstream.headers.get(name)
        if (value) outgoing[name] = value
      }
      response.writeHead(upstream.status, outgoing)
      if (request.method === 'HEAD' || !upstream.body) { response.end(); ticket.active.delete(controller); return }
      const stream = Readable.fromWeb(upstream.body as any)
      stream.once('error', () => response.destroy())
      response.once('close', () => stream.destroy())
      stream.pipe(response)
    })().catch(() => { if (!response.destroyed) fail(response, 502, 'Bilibili audio unavailable') })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
  })
  server.unref()
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('无法启动哔哩哔哩音频传输')
  const cookieChanged = () => {
    void context.cookies().then(cookies => {
      const current = identity(cookies)
      for (const [token, ticket] of tickets) if (ticket.identity !== current) { revoke(ticket); tickets.delete(token) }
    }).catch(() => { for (const ticket of tickets.values()) revoke(ticket); tickets.clear() })
  }
  context.session.cookies?.on('changed', cookieChanged)
  const cleanup = setInterval(() => {
    for (const [token, ticket] of tickets) if (ticket.expires <= Date.now() && !ticket.active.size) tickets.delete(token)
  }, 60_000)
  cleanup.unref()
  return {
    server,
    port: address.port,
    tickets,
    dispose: () => {
      clearInterval(cleanup)
      context.session.cookies?.removeListener('changed', cookieChanged)
      context.session.webRequest?.onBeforeSendHeaders(audioFilter, null)
      for (const ticket of tickets.values()) revoke(ticket)
      tickets.clear()
      server.closeAllConnections()
      server.close()
    },
  }
}

/** Stream through the authenticated platform session so audio retains its required Referer. */
export async function createBilibiliStream(context: ProviderContext, url: string, bvid: string, expires?: number, backupUrls: string[] = [], resolvedCookies?: Record<string, string>): Promise<string> {
  if (!isBilibiliAudioUrl(url) || !/^BV[\da-z]{10}$/i.test(bvid)) throw new Error('哔哩哔哩返回了无效的音频地址')
  let task = servers.get(context.session)
  if (!task) { task = createStreamServer(context); servers.set(context.session, task); void task.catch(() => servers.delete(context.session)) }
  const service = await task
  const currentIdentity = identity(await context.cookies())
  if (resolvedCookies && identity(resolvedCookies) !== currentIdentity) throw new Error('哔哩哔哩账号已更改，请重新播放')
  if (service.tickets.size >= 32) {
    for (const [token, ticket] of service.tickets) {
      if (ticket.active.size) continue
      service.tickets.delete(token)
      if (service.tickets.size < 32) break
    }
    if (service.tickets.size >= 32) throw new Error('哔哩哔哩播放请求过多，请稍后重试')
  }
  const token = randomBytes(32).toString('base64url')
  service.tickets.set(token, {
    urls: [...new Set([url, ...backupUrls.filter(isBilibiliAudioUrl)])],
    referer: `https://www.bilibili.com/video/${bvid}`,
    identity: currentIdentity,
    expires: Math.min(expires ?? Infinity, Date.now() + 60 * 60 * 1000),
    active: new Set(),
  })
  return `http://127.0.0.1:${service.port}/audio/${token}`
}

export const closeBilibiliStreams = async(context: ProviderContext) => {
  const task = servers.get(context.session)
  servers.delete(context.session)
  if (task) (await task).dispose()
}

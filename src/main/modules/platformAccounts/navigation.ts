const accountSessions = new WeakMap<Electron.Session, string[]>()

export const registerAccountSession = (session: Electron.Session, domains: string[]) => { accountSessions.set(session, domains) }
export const isAccountSession = (session: Electron.Session) => accountSessions.has(session)
export const canNavigateAccount = (session: Electron.Session, url: string) => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && Boolean(accountSessions.get(session)?.some(domain => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)))
  } catch { return false }
}

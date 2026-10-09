import fs from 'node:fs'
import path from 'node:path'

interface UserDataOptions {
  appDataPath: string
  env: { LINKLINE_DATA_DIR?: string, LX_STUDIO_DATA_DIR?: string }
  portablePath?: string
  acquireLegacyLock: (legacyPath: string) => boolean
  releaseLegacyLock: () => void
}

export interface UserDataDirectory {
  userDataPath: string
  appDataPath?: string
  migration: 'none' | 'copied' | 'legacy-in-use' | 'legacy-copy-failed'
}

export function prepareUserDataDirectory(options: UserDataOptions): UserDataDirectory {
  const override = options.env.LINKLINE_DATA_DIR?.trim() ? options.env.LINKLINE_DATA_DIR : options.env.LX_STUDIO_DATA_DIR
  if (override) return { userDataPath: path.resolve(override), migration: 'none' }
  if (options.portablePath && fs.existsSync(options.portablePath)) {
    return { userDataPath: path.join(options.portablePath, 'userData'), appDataPath: options.portablePath, migration: 'none' }
  }

  const userDataPath = path.join(options.appDataPath, 'LinkLine')
  const legacyPath = path.join(options.appDataPath, 'LX Studio')
  if (fs.existsSync(userDataPath) || !fs.existsSync(legacyPath)) return { userDataPath, migration: 'none' }
  const lockNames = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']
  if (lockNames.some(name => fs.existsSync(path.join(legacyPath, name)))) return { userDataPath: legacyPath, migration: 'legacy-in-use' }
  if (!options.acquireLegacyLock(legacyPath)) return { userDataPath: legacyPath, migration: 'legacy-in-use' }

  let stagingPath: string | undefined
  try {
    stagingPath = fs.mkdtempSync(path.join(options.appDataPath, '.LinkLine-migration-'))
    // Hold the legacy application's single-instance lock while copying its SQLite and Chromium stores.
    fs.cpSync(legacyPath, stagingPath, {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
      filter: source => !(path.dirname(source) === legacyPath && lockNames.includes(path.basename(source))),
    })
    if (!fs.existsSync(userDataPath)) fs.renameSync(stagingPath, userDataPath)
    return { userDataPath, migration: 'copied' }
  } catch (error) {
    console.warn('LinkLine could not copy the previous profile; using LX Studio data:', error)
    return { userDataPath: legacyPath, migration: 'legacy-copy-failed' }
  } finally {
    try {
      if (stagingPath && fs.existsSync(stagingPath)) fs.rmSync(stagingPath, { recursive: true, force: true })
    } catch (error) {
      console.warn('LinkLine could not remove its temporary profile copy:', error)
    } finally {
      options.releaseLegacyLock()
    }
  }
}

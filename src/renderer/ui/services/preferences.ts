import { appSetting } from '@renderer/store/setting'
import { updateSetting } from '@renderer/utils/ipc'

const migrationKey = 'linkline.player-progress-style.v1'
let playerStyleMigration: Promise<void> | null = null

export async function migratePlayerProgressStyle(): Promise<void> {
  playerStyleMigration ??= (async() => {
    if (localStorage.getItem(migrationKey)) return
    if (appSetting['common.playBarProgressStyle'] === 'mini') {
      await updateSetting({ 'common.playBarProgressStyle': 'full' })
      appSetting['common.playBarProgressStyle'] = 'full'
    }
    // Record even an already customized layout, so later user choices survive.
    localStorage.setItem(migrationKey, '1')
  })().catch(() => {
    // Retry on the next startup if storage or saving the setting was unavailable.
  })
  return playerStyleMigration
}

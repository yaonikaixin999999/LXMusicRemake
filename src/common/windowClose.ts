export type WindowCloseAction = 'ask' | 'tray' | 'quit'
export interface WindowCloseResponse { action: 'cancel' | 'tray' | 'quit', remember: boolean }

/** Introduce the tray prompt once, then retain deliberately saved preferences. */
export function migrateWindowCloseSetting(setting?: Partial<LX.AppSetting>): Partial<LX.AppSetting> | undefined {
  if (!setting || setting['common.closeAction'] != null) return setting
  return { ...setting, 'common.closeAction': 'ask', 'tray.enable': true }
}

export const WINDOW_CLOSE_EVENT_NAME = {
  requested: 'winMain_close_requested',
  ready: 'winMain_close_dialog_ready',
  respond: 'winMain_close_respond',
} as const

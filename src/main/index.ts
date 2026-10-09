import { app } from 'electron'
import { env as runtimeEnv } from 'node:process'
import './utils/logInit'
import '@common/error'
import {
  initGlobalData,
  initSingleInstanceHandle,
  applyElectronEnvParams,
  setUserDataPath,
  registerDeeplink,
  listenerAppEvent,
} from './app'
import { isLinux } from '@common/utils'
import { initAppSetting } from '@main/app'
import registerModules from '@main/modules'
import path from 'node:path'
import { prepareUserDataDirectory } from './utils/userDataDirectory'

// 初始化应用
const init = () => {
  console.log('init')
  if (process.env.BUILD_WIN7 == 'true') import('./utils/winLegacy')
  void initAppSetting().then(() => {
    registerModules()
    global.lx.event_app.app_inited()
  })
}

app.setName('LinkLine')
const dataDirectory = prepareUserDataDirectory({
  appDataPath: app.getPath('appData'),
  env: runtimeEnv,
  portablePath: process.platform === 'win32' ? path.join(path.dirname(app.getPath('exe')), 'portable') : undefined,
  acquireLegacyLock: legacyPath => {
    app.setPath('userData', legacyPath)
    return app.requestSingleInstanceLock()
  },
  releaseLegacyLock: () => { app.releaseSingleInstanceLock() },
})
if (dataDirectory.appDataPath) app.setPath('appData', dataDirectory.appDataPath)
app.setPath('userData', dataDirectory.userDataPath)
initGlobalData()
initSingleInstanceHandle()
applyElectronEnvParams()
setUserDataPath()
registerDeeplink(init)
listenerAppEvent(init)


// https://github.com/electron/electron/issues/16809
void app.whenReady().then(() => {
  isLinux ? setTimeout(init, 300) : init()
})

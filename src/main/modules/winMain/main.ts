import { BrowserWindow, dialog, session } from 'electron'
import path from 'node:path'
import { createTaskBarButtons, getWindowSizeInfo } from './utils'
import { getOSVersion, getPlatform, isWin } from '@common/utils'
import { getProxy, openDevTools as handleOpenDevTools } from '@main/utils'
import { mainSend } from '@common/mainIpc'
import { sendFocus, sendTaskbarButtonClick } from './rendererEvent'
import { encodePath } from '@common/utils/electron'
import { WINDOW_CLOSE_EVENT_NAME, type WindowCloseResponse } from '@common/windowClose'
import { quitApp } from '@main/app'
import { createTray, isTrayAvailable } from '@main/modules/tray'

let browserWindow: Electron.BrowserWindow | null = null
let closeRequested = false
let closeDialogReady = false
let nativeCloseDialog = false

/** Register the renderer dialog after its listener is installed. */
export const prepareCloseDialog = () => {
  closeDialogReady = true
  return closeRequested && !nativeCloseDialog
}

export const respondToClose = (response: WindowCloseResponse) => {
  if (!closeRequested || global.lx.isSkipTrayQuit || !browserWindow) return
  if (!response || !['cancel', 'tray', 'quit'].includes(response.action) || typeof response.remember !== 'boolean') throw new Error('无效的关闭窗口选项。')
  if (response.action === 'cancel') {
    closeRequested = false
    return
  }
  const patch: Partial<LX.AppSetting> = {}
  if (response.action === 'tray') patch['tray.enable'] = true
  if (response.remember) patch['common.closeAction'] = response.action
  if (Object.keys(patch).length) global.lx.event_app.update_config(patch)
  if (response.action === 'tray') {
    // Keep the window accessible if a tray cannot be created on this system.
    createTray()
    if (!isTrayAvailable()) throw new Error('无法创建托盘图标，窗口已保留，请重试或退出应用。')
    closeRequested = false
    if (browserWindow.isFullScreen()) browserWindow.setFullScreen(false)
    browserWindow.hide()
  } else {
    closeRequested = false
    quitApp()
  }
}

const requestClose = () => {
  if (!browserWindow || closeRequested) return
  closeRequested = true
  const action = global.lx.appSetting['common.closeAction']
  if (action === 'quit' || (action === 'tray' && global.lx.appSetting['tray.enable'])) {
    try { respondToClose({ action, remember: false }); return } catch { /* Allow choosing again if the tray is unavailable. */ }
  }
  showWindow()
  if (closeDialogReady && !browserWindow.webContents.isDestroyed()) {
    sendEvent(WINDOW_CLOSE_EVENT_NAME.requested)
    return
  }
  // Native fallback also covers closing before the renderer is ready or after
  // it has crashed. Never leave an invisible process without a tray icon.
  const window = browserWindow
  nativeCloseDialog = true
  void dialog.showMessageBox(window, {
    type: 'question',
    title: '关闭 LinkLine 窗口？',
    message: '关闭 LinkLine 窗口？',
    detail: '最小化到托盘后，音乐会继续播放；退出应用会停止播放。',
    buttons: ['取消', '退出应用', '最小化到托盘'],
    defaultId: 2,
    cancelId: 0,
    checkboxLabel: '不再询问',
    checkboxChecked: false,
    noLink: true,
  }).then(result => {
    nativeCloseDialog = false
    respondToClose({ action: result.response === 2 ? 'tray' : result.response === 1 ? 'quit' : 'cancel', remember: result.checkboxChecked })
  }).catch(() => { closeRequested = false; nativeCloseDialog = false })
}

export const getWindowState = () => ({
  isMaximized: browserWindow?.isMaximized() ?? false,
  isFullscreen: browserWindow?.isFullScreen() ?? false,
})
const sendWindowState = () => {
  sendEvent('winMain_window_state', getWindowState())
}

const winEvent = () => {
  if (!browserWindow) return

  browserWindow.on('close', event => {
    if (global.lx.isSkipTrayQuit) {
      browserWindow!.setProgressBar(-1)
      // global.lx.mainWindowClosed = true
      global.lx.event_app.main_window_close()
      return
    }

    event.preventDefault()
    requestClose()
  })

  browserWindow.on('closed', () => {
    // global.lx.mainWindowClosed = true
    browserWindow = null
    closeRequested = false
    closeDialogReady = false
    nativeCloseDialog = false
  })

  // browserWindow.on('restore', () => {
  //   browserWindow.webContents.send('restore')
  // })
  browserWindow.on('focus', () => {
    sendFocus()
    global.lx.event_app.main_window_focus()
  })

  browserWindow.on('blur', () => {
    global.lx.event_app.main_window_blur()
  })
  browserWindow.on('enter-full-screen', () => {
    global.lx.event_app.main_window_fullscreen(true)
    sendWindowState()
  })
  browserWindow.on('leave-full-screen', () => {
    global.lx.event_app.main_window_fullscreen(false)
    sendWindowState()
  })
  browserWindow.on('maximize', sendWindowState)
  browserWindow.on('unmaximize', sendWindowState)
  browserWindow.webContents.on('did-finish-load', sendWindowState)
  browserWindow.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) closeDialogReady = false
  })
  browserWindow.webContents.on('render-process-gone', () => { closeDialogReady = false; closeRequested = false })
  browserWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return
    if (input.key === 'F11') {
      event.preventDefault()
      void setFullScreen(!browserWindow?.isFullScreen())
    } else if (input.key === 'Escape' && browserWindow?.isFullScreen()) {
      event.preventDefault()
      void setFullScreen(false)
    }
  })

  browserWindow.once('ready-to-show', () => {
    if (!global.envParams.cmdParams.hidden) {
      showWindow()
      setThumbarButtons()
    }
    global.lx.event_app.main_window_ready_to_show()
  })

  browserWindow.on('show', () => {
    global.lx.event_app.main_window_show()

    // 修复隐藏窗口后再显示时任务栏按钮丢失的问题
    setThumbarButtons()
  })
  browserWindow.on('hide', () => {
    global.lx.event_app.main_window_hide()
  })
}


export const createWindow = () => {
  if (browserWindow) browserWindow.destroy()
  closeRequested = false
  closeDialogReady = false
  nativeCloseDialog = false
  const windowSizeInfo = getWindowSizeInfo(global.lx.appSetting['common.windowSizeId'])

  const { shouldUseDarkColors, theme } = global.lx.theme
  // Transparent Windows windows have no native resize border or reliable maximize.
  const disableTransparent = isWin || !!global.envParams.cmdParams.dt
  const ses = session.fromPartition('persist:win-main')
  const proxy = getProxy()
  setSesProxy(ses, proxy?.host, proxy?.port)

  /**
   * Initial window options
   */
  const options: Electron.BrowserWindowConstructorOptions = {
    height: windowSizeInfo.height,
    useContentSize: true,
    width: windowSizeInfo.width,
    frame: false,
    transparent: !disableTransparent,
    hasShadow: disableTransparent,
    // enableRemoteModule: false,
    icon: path.join(global.staticPath, 'images/linkline-icon.png'),
    resizable: true,
    maximizable: true,
    minWidth: 720,
    minHeight: 480,
    fullscreenable: true,
    roundedCorners: disableTransparent,
    show: false,
    webPreferences: {
      session: ses,
      nodeIntegrationInWorker: true,
      contextIsolation: false,
      webSecurity: false,
      nodeIntegration: true,
      backgroundThrottling: false,
      sandbox: false,
      enableWebSQL: false,
      webgl: false,
      spellcheck: false, // 禁用拼写检查器
    },
  }
  if (disableTransparent) options.backgroundColor = theme.colors['--color-primary-light-1000']
  if (global.lx.appSetting['common.startInFullscreen']) {
    options.fullscreen = true
  }
  browserWindow = new BrowserWindow(options)

  const winURL = process.env.NODE_ENV !== 'production' ? 'http://localhost:9080' : `file://${path.join(encodePath(__dirname), 'index.html')}`
  void browserWindow.loadURL(winURL + `?os=${getPlatform()}&osver=${encodeURIComponent(getOSVersion())}&dt=${disableTransparent}&dark=${shouldUseDarkColors}&theme=${encodeURIComponent(JSON.stringify(theme))}`)

  winEvent()

  if (global.envParams.cmdParams.odt) handleOpenDevTools(browserWindow.webContents)

  // global.lx.mainWindowClosed = false
  // browserWindow.webContents.openDevTools()
  global.lx.event_app.main_window_created(browserWindow)
}

export const isExistWindow = (): boolean => !!browserWindow
export const isShowWindow = (): boolean => {
  if (!browserWindow) return false
  return browserWindow.isVisible() && (isWin ? true : browserWindow.isFocused())
}

export const closeWindow = () => {
  if (!browserWindow) return
  browserWindow.close()
}

const setSesProxy = (ses: Electron.Session, host?: string, port?: string | number) => {
  if (host) {
    void ses.setProxy({
      mode: 'fixed_servers',
      proxyRules: `http://${host}:${port}`,
    })
  } else {
    void ses.setProxy({
      mode: 'direct',
    })
  }
}
export const setProxy = () => {
  if (!browserWindow) return
  const proxy = getProxy()
  setSesProxy(browserWindow.webContents.session, proxy?.host, proxy?.port)
}


export const sendEvent = <T = any>(name: string, params?: T) => {
  if (!browserWindow) return
  mainSend(browserWindow, name, params)
}

export const showSelectDialog = async(options: Electron.OpenDialogOptions) => {
  if (!browserWindow) throw new Error('main window is undefined')
  return dialog.showOpenDialog(browserWindow, options)
}
export const showDialog = ({ type, message, detail }: Electron.MessageBoxSyncOptions) => {
  if (!browserWindow) return
  dialog.showMessageBoxSync(browserWindow, {
    type,
    message,
    detail,
  })
}
export const showSaveDialog = async(options: Electron.SaveDialogOptions) => {
  if (!browserWindow) throw new Error('main window is undefined')
  return dialog.showSaveDialog(browserWindow, options)
}
export const minimize = () => {
  if (!browserWindow) return
  browserWindow.minimize()
}
export const maximize = () => {
  if (!browserWindow) return
  browserWindow.maximize()
}
export const unmaximize = () => {
  if (!browserWindow) return
  browserWindow.unmaximize()
}
export const toggleMaximize = async() => {
  if (!browserWindow) return getWindowState()
  if (browserWindow.isFullScreen()) await setFullScreen(false)
  else if (browserWindow.isMaximized()) browserWindow.unmaximize()
  else browserWindow.maximize()
  return getWindowState()
}
export const toggleHide = () => {
  if (!browserWindow) return
  browserWindow.isVisible()
    ? browserWindow.hide()
    : browserWindow.show()
}
export const toggleMinimize = () => {
  if (!browserWindow) return
  if (browserWindow.isVisible()) {
    if (browserWindow.isMinimized()) browserWindow.restore()
    else browserWindow.minimize()
  } else browserWindow.show()
}
export const showWindow = () => {
  if (!browserWindow) return
  if (browserWindow.isVisible()) {
    if (browserWindow.isMinimized()) browserWindow.restore()
    else browserWindow.focus()
  } else browserWindow.show()
}
export const hideWindow = () => {
  if (!browserWindow) return
  browserWindow.hide()
}
export const setWindowBounds = (options: Partial<Electron.Rectangle>) => {
  if (!browserWindow) return
  browserWindow.setBounds(options)
}
export const setProgressBar = (progress: number, options?: Electron.ProgressBarOptions) => {
  if (!browserWindow) return
  browserWindow.setProgressBar(progress, options)
}
export const setIgnoreMouseEvents = (ignore: boolean, options?: Electron.IgnoreMouseEventsOptions) => {
  if (!browserWindow) return
  browserWindow.setIgnoreMouseEvents(ignore, options)
}
export const toggleDevTools = () => {
  if (!browserWindow) return
  if (browserWindow.webContents.isDevToolsOpened()) {
    browserWindow.webContents.closeDevTools()
  } else {
    handleOpenDevTools(browserWindow.webContents)
  }
}

export const setFullScreen = async(isFullscreen: boolean): Promise<boolean> => {
  if (!browserWindow) return false
  const win = browserWindow
  if (win.isFullScreen() === isFullscreen) return isFullscreen
  return new Promise(resolve => {
    let completed = false
    let poll: NodeJS.Timeout | undefined
    const complete = () => {
      if (completed) return
      completed = true
      clearTimeout(timeout)
      clearTimeout(poll)
      if (isFullscreen) win.removeListener('enter-full-screen', check)
      else win.removeListener('leave-full-screen', check)
      sendWindowState()
      resolve(win.isDestroyed() ? false : win.isFullScreen())
    }
    const check = () => {
      if (completed) return
      if (win.isDestroyed() || win.isFullScreen() === isFullscreen) complete()
      else {
        clearTimeout(poll)
        poll = setTimeout(check, 16)
      }
    }
    const timeout = setTimeout(complete, 1500)
    if (isFullscreen) win.once('enter-full-screen', check)
    else win.once('leave-full-screen', check)
    win.setFullScreen(isFullscreen)
    check()
  })
}

const taskBarButtonFlags: LX.TaskBarButtonFlags = {
  empty: true,
  collect: false,
  play: false,
  next: true,
  prev: true,
}
export const setThumbarButtons = ({ empty, collect, play, next, prev }: LX.TaskBarButtonFlags = taskBarButtonFlags) => {
  if (!isWin || !browserWindow) return
  taskBarButtonFlags.empty = empty
  taskBarButtonFlags.collect = collect
  taskBarButtonFlags.play = play
  taskBarButtonFlags.next = next
  taskBarButtonFlags.prev = prev
  browserWindow.setThumbarButtons(createTaskBarButtons(taskBarButtonFlags, action => {
    sendTaskbarButtonClick(action)
  }))
}

export const setThumbnailClip = (region: Electron.Rectangle) => {
  if (!browserWindow) return
  browserWindow.setThumbnailClip(region)
}


export const clearCache = async() => {
  if (!browserWindow) throw new Error('main window is undefined')
  await browserWindow.webContents.session.clearCache()
}

export const getCacheSize = async() => {
  if (!browserWindow) throw new Error('main window is undefined')
  return browserWindow.webContents.session.getCacheSize()
}

export const getWebContents = (): Electron.WebContents => {
  if (!browserWindow) throw new Error('main window is undefined')
  return browserWindow.webContents
}

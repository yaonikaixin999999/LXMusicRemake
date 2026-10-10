import { screen } from 'electron'

// 设置窗口位置、大小
export const minWidth = 320
export const minHeight = 180

const getWorkArea = (bounds?: Electron.Rectangle): Electron.Rectangle => {
  return bounds
    ? screen.getDisplayMatching(bounds).workArea
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
}

/** Recover saved positions after a display is disconnected or its scale changes. */
const fitWindow = (bounds: Electron.Rectangle, area: Electron.Rectangle): Electron.Rectangle => {
  const width = Math.min(area.width, Math.max(minWidth, bounds.width))
  const height = Math.min(area.height, Math.max(minHeight, bounds.height))
  return {
    width,
    height,
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))),
  }
}


// const updateBounds = (bounds: Bounds) => {
//   bounds.x = bounds.x
//   return bounds
// }

/**
 *
 * @param bounds 当前设置
 * @param param 新设置（相对于当前设置）
 * @returns
 */
export const getLyricWindowBounds = (bounds: Electron.Rectangle, { x, y, w, h }: LX.DesktopLyric.NewBounds): Electron.Rectangle => {
  if (w < minWidth) {
    if (x > 0 && w < bounds.width) x = Math.min(x, bounds.width - minWidth)
    w = minWidth
  }
  if (h < minHeight) {
    if (y > 0 && h < bounds.height) y = Math.min(y, bounds.height - minHeight)
    h = minHeight
  }

  if (global.lx.appSetting['desktopLyric.isLockScreen']) {
    const next = { x: x + bounds.x, y: y + bounds.y, width: w, height: h }
    return fitWindow(next, getWorkArea(next))
  } else {
    y += bounds.y
    x += bounds.x
  }

  // console.log('util bounds', bounds)
  return { width: w, height: h, x, y }
}


export const watchConfigKeys = [
  'desktopLyric.enable',
  'desktopLyric.isLock',
  'desktopLyric.isAlwaysOnTop',
  'desktopLyric.isAlwaysOnTopLoop',
  'desktopLyric.isShowTaskbar',
  'desktopLyric.pauseHide',
  'desktopLyric.audioVisualization',
  'desktopLyric.width',
  'desktopLyric.height',
  'desktopLyric.x',
  'desktopLyric.y',
  'desktopLyric.isLockScreen',
  'desktopLyric.isDelayScroll',
  'desktopLyric.scrollAlign',
  'desktopLyric.isHoverHide',
  'desktopLyric.direction',
  'desktopLyric.style.align',
  'desktopLyric.style.lyricUnplayColor',
  'desktopLyric.style.lyricPlayedColor',
  'desktopLyric.style.lyricShadowColor',
  'desktopLyric.style.font',
  'desktopLyric.style.fontSize',
  'desktopLyric.style.lineGap',
  // 'desktopLyric.style.fontWeight',
  'desktopLyric.style.opacity',
  'desktopLyric.style.backgroundOpacity',
  'desktopLyric.style.ellipsis',
  'desktopLyric.style.isFontWeightFont',
  'desktopLyric.style.isFontWeightLine',
  'desktopLyric.style.isFontWeightExtended',
  'desktopLyric.style.isZoomActiveLrc',
  'common.langId',
  'player.isShowLyricTranslation',
  'player.isShowLyricRoma',
  'player.isSwapLyricTranslationAndRoma',
  'player.isPlayLxlrc',
  'player.playbackRate',
] satisfies Array<keyof LX.AppSetting>

export const buildLyricConfig = (appSetting: Partial<LX.AppSetting>): Partial<LX.DesktopLyric.Config> => {
  const setting: Partial<LX.DesktopLyric.Config> = {}
  for (const key of watchConfigKeys) {
    // @ts-expect-error
    if (key in appSetting) setting[key] = appSetting[key]
  }
  return setting
}

export const initWindowSize = (x: LX.AppSetting['desktopLyric.x'], y: LX.AppSetting['desktopLyric.y'], width: LX.AppSetting['desktopLyric.width'], height: LX.AppSetting['desktopLyric.height']) => {
  width = Number.isFinite(width) ? Math.max(minWidth, Math.round(width)) : 450
  height = Number.isFinite(height) ? Math.max(minHeight, Math.round(height)) : 300
  const positioned = x != null && y != null && Number.isFinite(x) && Number.isFinite(y)
  const area = getWorkArea(positioned ? { x, y, width, height } : undefined)
  return fitWindow({
    x: positioned ? x : area.x + (area.width - Math.min(area.width, width)) / 2,
    y: positioned ? y : area.y + area.height - Math.min(area.height, height) - 24,
    width,
    height,
  }, area)
}

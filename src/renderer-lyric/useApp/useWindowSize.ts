import { onBeforeUnmount } from 'vue'
import { setting } from '@lyric/store/state'
import { setWindowBounds } from '@lyric/utils/ipc'

type Origin = 'left' | 'top' | 'right' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export default () => {
  let origin: Origin | null = null
  let previousX = 0
  let previousY = 0
  const stop = () => {
    origin = null
    document.removeEventListener('pointermove', move)
    document.removeEventListener('pointerup', stop)
    document.removeEventListener('pointercancel', stop)
  }
  const move = (event: PointerEvent) => {
    if (!origin || setting['desktopLyric.isLock']) { stop(); return }
    const dx = event.screenX - previousX
    const dy = event.screenY - previousY
    previousX = event.screenX
    previousY = event.screenY
    const left = origin.includes('left')
    const top = origin.includes('top')
    setWindowBounds({
      x: left ? dx : 0,
      y: top ? dy : 0,
      w: window.innerWidth + (left ? -dx : origin.includes('right') ? dx : 0),
      h: window.innerHeight + (top ? -dy : origin.includes('bottom') ? dy : 0),
    })
  }
  const startResize = (edge: Origin, event: PointerEvent) => {
    if (event.button !== 0 || setting['desktopLyric.isLock']) return
    stop()
    origin = edge
    previousX = event.screenX
    previousY = event.screenY
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', stop)
    document.addEventListener('pointercancel', stop)
  }
  onBeforeUnmount(stop)
  return { startResize }
}

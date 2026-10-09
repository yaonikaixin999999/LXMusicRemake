import { onBeforeUnmount } from 'vue'
import { setting } from '@lyric/store/state'
import { setWindowBounds, setWindowResizeable } from '@lyric/utils/ipc'

/** Move the real desktop window from its new title bar and empty lyric area. */
export default function useDesktopDrag() {
  let active = false
  let previousX = 0
  let previousY = 0
  function move(event: PointerEvent) {
    if (!active || setting['desktopLyric.isLock']) return
    const x = event.screenX - previousX
    const y = event.screenY - previousY
    previousX = event.screenX
    previousY = event.screenY
    setWindowBounds({ x, y, w: window.innerWidth, h: window.innerHeight })
  }
  function stop() {
    active = false
    setWindowResizeable(true)
    document.removeEventListener('pointermove', move)
    document.removeEventListener('pointerup', stop)
    document.removeEventListener('pointercancel', stop)
  }
  function start(event: PointerEvent) {
    const target = event.target
    if (event.button !== 0 || setting['desktopLyric.isLock'] || !(target instanceof HTMLElement) || target.closest('button, input, select, .lyric-stage-flow')) return
    event.preventDefault()
    stop()
    active = true
    previousX = event.screenX
    previousY = event.screenY
    setWindowResizeable(false)
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', stop)
    document.addEventListener('pointercancel', stop)
  }
  onBeforeUnmount(stop)
  return start
}

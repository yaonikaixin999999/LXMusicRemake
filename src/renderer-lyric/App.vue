<template>
  <div class="lyric-window" :class="{ locked: setting['desktopLyric.isLock'], hidden: isHide || isHoverHide }">
    <div class="lyric-window-card" @pointerdown="startDrag">
      <LyricSpectrum v-if="setting['desktopLyric.audioVisualization']" />
      <LyricStage />
      <LyricToolbar v-if="!setting['desktopLyric.isLock']" />
      <div v-if="!setting['desktopLyric.isLock']" class="lyric-window-status"><span>{{ isPlay ? 'NOW PLAYING' : 'DESKTOP LYRICS' }}</span><span>拖动顶部移动窗口</span></div>
    </div>
    <template v-if="isShowResize && !setting['desktopLyric.isLock']"><div v-for="edge in edges" :key="edge" class="lyric-window-resize" :class="`lyric-window-resize-${edge}`" @mousedown.self="handleMouseDown(edge, $event)" @touchstart.self="handleTouchDown(edge, $event)" /></template>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { setting, isPlay } from '@lyric/store/state'
import useWindowSize from '@lyric/useApp/useWindowSize'
import useHoverHide from '@lyric/useApp/useHoverHide'
import useCommon from '@lyric/useApp/useCommon'
import useLyric from '@lyric/useApp/useLyric'
import useTheme from '@lyric/useApp/useTheme'
import usePauseHide from '@lyric/useApp/usePauseHide'
import { init as initLyricPlayer } from '@lyric/core/lyric'
import { sendConnectMainWindowEvent } from '@lyric/utils/ipc'
import { useAppearance } from '../renderer/composables/useAppearance'
import LyricToolbar from './ui/LyricToolbar.vue'
import LyricStage from './ui/LyricStage.vue'
import LyricSpectrum from './ui/LyricSpectrum.vue'
import useDesktopDrag from './ui/useDesktopDrag'

useAppearance()
useCommon()
useLyric()
useTheme()
const isHoverHide = useHoverHide()
const isHide = usePauseHide()
const startDrag = useDesktopDrag()
const { handleMouseDown, handleTouchDown } = useWindowSize()
const isShowResize = window.os !== 'windows'
const edges = ['left', 'right', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right']
onMounted(() => { initLyricPlayer(); sendConnectMainWindowEvent() })
</script>

<style lang="less">
@import './assets/styles/reset.less';
html, body, #root { width: 100%; height: 100%; margin: 0; background: transparent; overflow: hidden; }
body { user-select: none; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; -webkit-font-smoothing: antialiased; }
.lyric-window { height: 100%; box-sizing: border-box; padding: 7px; opacity: 1; transition: opacity .2s; }
.lyric-window.hidden { opacity: .04; &:not(.locked):hover { opacity: 1; } }
.lyric-window-card { height: 100%; position: relative; overflow: hidden; border-radius: var(--modern-radius, 18px); background: rgba(27, 33, 30, .68); border: 1px solid rgba(255, 255, 255, .11); box-shadow: 0 4px 18px rgba(0, 0, 0, .12); box-sizing: border-box; cursor: move; &:hover .lyric-toolbar, &:focus-within .lyric-toolbar { opacity: 1; } }
.lyric-window.locked { padding: 0; .lyric-window-card { background: transparent; border-color: transparent; box-shadow: none; } }
.lyric-window-status { position: absolute; bottom: 10px; left: 16px; right: 16px; display: flex; justify-content: space-between; align-items: center; pointer-events: none; color: rgba(255, 255, 255, .34); font-size: 7px; letter-spacing: 1.1px; opacity: 0; transition: opacity .18s; }
.lyric-window-card:hover .lyric-window-status { opacity: 1; }
.lyric-window-resize { position: absolute; z-index: 10; }
.lyric-window-resize-left, .lyric-window-resize-right { top: 0; height: 100%; width: 6px; cursor: ew-resize; }
.lyric-window-resize-left { left: 0; }.lyric-window-resize-right { right: 0; }
.lyric-window-resize-top, .lyric-window-resize-bottom { left: 0; width: 100%; height: 6px; cursor: ns-resize; }
.lyric-window-resize-top { top: 0; }.lyric-window-resize-bottom { bottom: 0; }
.lyric-window-resize-top-left, .lyric-window-resize-top-right, .lyric-window-resize-bottom-left, .lyric-window-resize-bottom-right { width: 8px; height: 8px; }
.lyric-window-resize-top-left { top: 0; left: 0; cursor: nwse-resize; }.lyric-window-resize-top-right { top: 0; right: 0; cursor: nesw-resize; }.lyric-window-resize-bottom-left { bottom: 0; left: 0; cursor: nesw-resize; }.lyric-window-resize-bottom-right { bottom: 0; right: 0; cursor: nwse-resize; }
@media (prefers-reduced-motion: reduce) { .lyric-window, .lyric-toolbar, .lyric-window-status, .lyric-stage .line-content { transition: none; } }
</style>

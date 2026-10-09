<template>
  <header class="lyric-toolbar">
    <div class="lyric-toolbar-title"><span class="lyric-toolbar-dot" :class="{ playing: isPlay }" /><div><strong>{{ musicInfo.id ? musicInfo.name : 'LX Studio' }}</strong><small>{{ musicInfo.id ? musicInfo.singer || '未知歌手' : '桌面歌词' }}</small></div></div>
    <div class="lyric-toolbar-buttons"><button type="button" title="减小字号" aria-label="减小字号" @click="font(-1)"><UiIcon name="fontMinus" /></button><button type="button" title="增大字号" aria-label="增大字号" @click="font(1)"><UiIcon name="fontPlus" /></button><button type="button" :class="{ active: setting['desktopLyric.isAlwaysOnTop'] }" title="窗口置顶" aria-label="窗口置顶" :aria-pressed="setting['desktopLyric.isAlwaysOnTop']" @click="save({ 'desktopLyric.isAlwaysOnTop': !setting['desktopLyric.isAlwaysOnTop'] })"><UiIcon name="pin" /></button><button type="button" title="切换歌词方向" aria-label="切换歌词方向" @click="save({ 'desktopLyric.direction': setting['desktopLyric.direction'] === 'vertical' ? 'horizontal' : 'vertical' })"><UiIcon :name="setting['desktopLyric.direction'] === 'vertical' ? 'horizontal' : 'vertical'" /></button><button type="button" title="歌词偏好" aria-label="歌词偏好" :aria-expanded="preferences" @click="preferences = !preferences"><UiIcon name="settings" /></button><button type="button" title="锁定歌词窗口，穿透鼠标" aria-label="锁定歌词窗口" @click="save({ 'desktopLyric.isLock': true })"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" stroke="currentColor" stroke-width="1.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.5" /></svg></button><button type="button" title="关闭桌面歌词" aria-label="关闭桌面歌词" @click="save({ 'desktopLyric.enable': false })"><UiIcon name="close" /></button></div>
    <div v-if="preferences" class="lyric-toolbar-preferences" @pointerdown.stop>
      <div class="lyric-toolbar-preferences-heading"><strong>歌词偏好</strong><button type="button" aria-label="关闭歌词偏好" @click="preferences = false"><UiIcon name="close" /></button></div>
      <label><span>透明度</span><input type="range" min="6" max="100" :value="setting['desktopLyric.style.opacity']" @input="changeOpacity"><small>{{ setting['desktopLyric.style.opacity'] }}%</small></label>
      <label><span>行距</span><input type="range" min="2" max="50" :value="setting['desktopLyric.style.lineGap']" @input="changeGap"><small>{{ setting['desktopLyric.style.lineGap'] }}</small></label>
      <div class="lyric-toolbar-toggle"><span>高亮放大</span><button type="button" :aria-pressed="setting['desktopLyric.style.isZoomActiveLrc']" @click="save({ 'desktopLyric.style.isZoomActiveLrc': !setting['desktopLyric.style.isZoomActiveLrc'] })">{{ setting['desktopLyric.style.isZoomActiveLrc'] ? '开启' : '关闭' }}</button></div>
      <div class="lyric-toolbar-toggle"><span>翻译歌词</span><button type="button" :aria-pressed="setting['player.isShowLyricTranslation']" @click="save({ 'player.isShowLyricTranslation': !setting['player.isShowLyricTranslation'] })">{{ setting['player.isShowLyricTranslation'] ? '开启' : '关闭' }}</button></div>
      <div class="lyric-toolbar-toggle"><span>罗马音</span><button type="button" :aria-pressed="setting['player.isShowLyricRoma']" @click="save({ 'player.isShowLyricRoma': !setting['player.isShowLyricRoma'] })">{{ setting['player.isShowLyricRoma'] ? '开启' : '关闭' }}</button></div>
      <div class="lyric-toolbar-toggle"><span>音频频谱</span><button type="button" :aria-pressed="setting['desktopLyric.audioVisualization']" @click="save({ 'desktopLyric.audioVisualization': !setting['desktopLyric.audioVisualization'] })">{{ setting['desktopLyric.audioVisualization'] ? '开启' : '关闭' }}</button></div>
      <div class="lyric-toolbar-colors"><span>高亮颜色</span><button v-for="color in colors" :key="color" type="button" :style="{ background: color }" :aria-label="`高亮颜色 ${color}`" @click="save({ 'desktopLyric.style.lyricPlayedColor': color })" /><input type="color" :value="customColor" aria-label="自定义歌词高亮颜色" @input="changeColor"></div>
      <p v-if="error" class="lyric-toolbar-error" role="alert">{{ error }}</p>
    </div>
  </header>
</template>

<script setup lang="ts">
import UiIcon from '@renderer/ui/components/UiIcon.vue'
import { computed, ref } from 'vue'
import { isPlay, musicInfo, setting } from '@lyric/store/state'
import { updateSetting } from '@lyric/utils/ipc'
const preferences = ref(false)
const error = ref('')
const colors = ['#a1c8ae', '#b6c6e4', '#d2b8dc', '#efc791']
const customColor = computed(() => /^#[\da-f]{6}$/i.test(setting['desktopLyric.style.lyricPlayedColor']) ? setting['desktopLyric.style.lyricPlayedColor'] : '#a1c8ae')
async function save(config: Partial<LX.DesktopLyric.Config>) {
  error.value = ''
  try { await updateSetting(config) } catch { error.value = '设置未能保存，请重试。'; preferences.value = true }
}
async function font(step: number) { await save({ 'desktopLyric.style.fontSize': Math.max(10, Math.min(80, setting['desktopLyric.style.fontSize'] + step)) }) }
async function changeOpacity(event: Event) { await save({ 'desktopLyric.style.opacity': Number((event.target as HTMLInputElement).value) }) }
async function changeGap(event: Event) { await save({ 'desktopLyric.style.lineGap': Number((event.target as HTMLInputElement).value) }) }
async function changeColor(event: Event) { await save({ 'desktopLyric.style.lyricPlayedColor': (event.target as HTMLInputElement).value }) }
</script>

<style lang="less">
.lyric-toolbar { position: absolute; top: 0; left: 0; right: 0; height: 48px; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: var(--modern-panel); color: var(--modern-text); border-bottom: 1px solid var(--modern-border); z-index: 5; opacity: 0; transition: opacity .18s; cursor: move; box-sizing: border-box; }
.lyric-toolbar-title { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 30px; div { overflow: hidden; strong, small { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.4; } strong { font-size: 10px; font-weight: 500; } small { font-size: 8px; color: var(--modern-muted); margin-top: 2px; } } }
.lyric-toolbar-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--modern-muted); flex: none; &.playing { background: var(--modern-accent); } }
.lyric-toolbar-buttons { display: flex; align-items: center; gap: 2px; flex: none; button { width: 26px; height: 27px; border: 0; border-radius: 7px; background: transparent; color: var(--modern-muted); cursor: pointer; padding: 0; font-size: 14px; display: grid; place-items: center; &:first-child, &:nth-child(2) { font-size: 10px; } &:hover, &.active { color: var(--modern-accent-ink); background: var(--modern-accent-soft); } svg { width: 14px; height: 14px; } &:focus-visible { outline: 2px solid var(--modern-accent); } } }
.lyric-toolbar-preferences { position: absolute; right: 8px; top: 51px; width: 235px; max-height: calc(100vh - 75px); overflow-y: auto; border-radius: 14px; border: 1px solid var(--modern-border); padding: 15px; background: var(--modern-panel); color: var(--modern-text); box-shadow: 0 12px 40px rgba(0, 0, 0, .2); cursor: default; box-sizing: border-box; > label { display: flex; align-items: center; gap: 10px; font-size: 10px; margin-bottom: 12px; > span { width: 38px; flex: none; } input { width: 0; flex: 1; height: 16px; accent-color: var(--modern-accent); } small { width: 25px; text-align: right; font-size: 9px; color: var(--modern-muted); } } }
.lyric-toolbar-preferences-heading { display: flex; align-items: center; justify-content: space-between; font-size: 12px; margin-bottom: 15px; button { border: 0; color: var(--modern-muted); background: transparent; cursor: pointer; } }
.lyric-toolbar-toggle { display: flex; align-items: center; justify-content: space-between; font-size: 10px; margin-bottom: 10px; button { border: 0; border-radius: 6px; background: var(--modern-hover); color: var(--modern-muted); font-size: 9px; padding: 4px 8px; cursor: pointer; &[aria-pressed='true'] { color: var(--modern-accent-ink); background: var(--modern-accent-soft); } } }
.lyric-toolbar-colors { display: flex; align-items: center; gap: 7px; font-size: 10px; margin-top: 15px; > span { margin-right: auto; } button { width: 16px; height: 16px; border: 0; border-radius: 50%; cursor: pointer; } input { width: 20px; height: 20px; border: 0; padding: 0; background: transparent; cursor: pointer; } }
.lyric-toolbar-error { margin-top: 10px; font-size: 9px; color: #c66666; }
</style>

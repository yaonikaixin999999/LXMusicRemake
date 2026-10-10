<template>
  <button v-if="setting['desktopLyric.isLock']" type="button" class="lyric-unlock" title="解锁桌面歌词" aria-label="解锁桌面歌词" @click="save({ 'desktopLyric.isLock': false })"><UiIcon name="lock" /></button>
  <header v-else class="lyric-toolbar">
    <div class="lyric-toolbar-title"><span class="lyric-toolbar-dot" :class="{ playing: isPlay }" /><div><strong>{{ musicInfo.id ? musicInfo.name : 'LinkLine' }}</strong><small>{{ musicInfo.id ? musicInfo.singer || '未知歌手' : '桌面歌词' }}</small></div></div>
    <div class="lyric-toolbar-buttons">
      <button type="button" title="上一首" aria-label="上一首" @click="control('prev')"><UiIcon name="prev" /></button>
      <button type="button" :title="isPlay ? '暂停' : '播放'" :aria-label="isPlay ? '暂停' : '播放'" @click="control(isPlay ? 'pause' : 'play')"><UiIcon :name="isPlay ? 'pause' : 'play'" filled /></button>
      <button type="button" title="下一首" aria-label="下一首" @click="control('next')"><UiIcon name="next" /></button>
      <button type="button" :class="{ active: setting['desktopLyric.isAlwaysOnTop'] }" title="窗口置顶" aria-label="窗口置顶" :aria-pressed="setting['desktopLyric.isAlwaysOnTop']" @click="save({ 'desktopLyric.isAlwaysOnTop': !setting['desktopLyric.isAlwaysOnTop'] })"><UiIcon name="pin" /></button>
      <button type="button" title="切换歌词方向" aria-label="切换歌词方向" @click="save({ 'desktopLyric.direction': setting['desktopLyric.direction'] === 'vertical' ? 'horizontal' : 'vertical' })"><UiIcon :name="setting['desktopLyric.direction'] === 'vertical' ? 'horizontal' : 'vertical'" /></button>
      <button type="button" title="歌词偏好" aria-label="歌词偏好" :aria-expanded="preferences" @click="preferences = !preferences"><UiIcon name="settings" /></button>
      <button type="button" title="锁定歌词窗口" aria-label="锁定歌词窗口" @click="save({ 'desktopLyric.isLock': true })"><UiIcon name="lock" /></button>
      <button type="button" title="关闭桌面歌词" aria-label="关闭桌面歌词" @click="save({ 'desktopLyric.enable': false })"><UiIcon name="close" /></button>
    </div>
    <section v-if="preferences" class="lyric-toolbar-preferences" role="dialog" aria-label="歌词偏好" @pointerdown.stop @keydown.esc.stop="preferences = false">
      <div class="lyric-toolbar-preferences-heading"><strong>歌词偏好</strong><button type="button" title="关闭歌词偏好" aria-label="关闭歌词偏好" @click="preferences = false"><UiIcon name="close" /></button></div>
      <label class="lyric-range"><span>文字透明度</span><input type="range" min="20" max="100" :value="setting['desktopLyric.style.opacity']" aria-label="歌词文字透明度" @input="number('desktopLyric.style.opacity', $event)"><output>{{ Math.max(20, setting['desktopLyric.style.opacity']) }}%</output></label>
      <label class="lyric-range"><span>背景不透明度</span><input type="range" min="0" max="100" :value="setting['desktopLyric.style.backgroundOpacity']" aria-label="歌词背景不透明度" @input="number('desktopLyric.style.backgroundOpacity', $event)"><output>{{ setting['desktopLyric.style.backgroundOpacity'] }}%</output></label>
      <p class="lyric-background-hint">0% 为全透明背景，100% 为不透明；不影响文字和工具栏。</p>
      <label class="lyric-range"><span>字号</span><input type="range" min="10" max="80" :value="setting['desktopLyric.style.fontSize']" aria-label="歌词字号" @input="number('desktopLyric.style.fontSize', $event)"><output>{{ setting['desktopLyric.style.fontSize'] }}</output></label>
      <label class="lyric-range"><span>行距</span><input type="range" min="0" max="50" :value="setting['desktopLyric.style.lineGap']" aria-label="歌词行距" @input="number('desktopLyric.style.lineGap', $event)"><output>{{ setting['desktopLyric.style.lineGap'] }}</output></label>
      <label class="lyric-choice"><span>字体</span><input type="text" :value="setting['desktopLyric.style.font']" placeholder="系统默认" aria-label="歌词字体" @change="save({ 'desktopLyric.style.font': ($event.target as HTMLInputElement).value.trim() })"></label>
      <label class="lyric-choice"><span>对齐</span><select :value="setting['desktopLyric.style.align']" aria-label="歌词对齐" @change="save({ 'desktopLyric.style.align': ($event.target as HTMLSelectElement).value as LX.DesktopLyric.Config['desktopLyric.style.align'] })"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
      <div v-for="color in colorFields" :key="color.key" class="lyric-toolbar-colors"><span>{{ color.label }}</span><input type="color" :value="colorValue(color.key)" :aria-label="color.label" @input="save({ [color.key]: ($event.target as HTMLInputElement).value })"><button type="button" title="恢复默认颜色" aria-label="恢复默认颜色" @click="resetColors"><UiIcon name="refresh" /></button></div>
      <label v-for="toggle in toggles" :key="toggle.key" class="lyric-toolbar-toggle"><span>{{ toggle.label }}</span><input type="checkbox" :checked="Boolean(setting[toggle.key])" @change="save({ [toggle.key]: ($event.target as HTMLInputElement).checked })"></label>
      <button class="lyric-theme-button" type="button" @click="appearance.mode = resolvedAppearanceMode === 'light' ? 'dark' : 'light'"><UiIcon :name="resolvedAppearanceMode === 'light' ? 'moon' : 'sun'" />{{ resolvedAppearanceMode === 'light' ? '深色外观' : '浅色外观' }}</button>
      <p v-if="error" class="lyric-toolbar-error" role="alert">{{ error }}</p>
    </section>
  </header>
</template>

<script setup lang="ts">
import UiIcon from '@renderer/ui/components/UiIcon.vue'
import { ref, watch } from 'vue'
import { isPlay, musicInfo, setting } from '@lyric/store/state'
import { updateSetting, sendPlayerControl } from '@lyric/utils/ipc'
import { appearance, resolvedAppearanceMode } from '../../renderer/composables/useAppearance'
const preferences = ref(false)
const error = ref('')
const colorFields = [{ key: 'desktopLyric.style.lyricPlayedColor', label: '高亮颜色' }, { key: 'desktopLyric.style.lyricUnplayColor', label: '正文颜色' }, { key: 'desktopLyric.style.lyricShadowColor', label: '描边颜色' }] as const
const toggles = [{ key: 'desktopLyric.style.isZoomActiveLrc', label: '高亮放大' }, { key: 'player.isShowLyricTranslation', label: '翻译歌词' }, { key: 'player.isShowLyricRoma', label: '罗马音' }, { key: 'desktopLyric.audioVisualization', label: '音频频谱' }, { key: 'desktopLyric.pauseHide', label: '锁定后暂停隐藏' }, { key: 'desktopLyric.isHoverHide', label: '锁定后悬停隐藏' }, { key: 'desktopLyric.isDelayScroll', label: '延迟滚动' }] as const
watch(() => setting['desktopLyric.isLock'], () => { preferences.value = false })
function colorValue(key: typeof colorFields[number]['key']) {
  const value = setting[key]
  if (/^#[\da-f]{6}$/i.test(value)) return value
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number)
  return channels?.length === 3 ? `#${channels.map((channel: number) => Math.min(255, Math.max(0, Math.round(channel))).toString(16).padStart(2, '0')).join('')}` : '#ffffff'
}
async function save(config: Partial<LX.DesktopLyric.Config>) {
  error.value = ''
  try { await updateSetting(config) } catch { error.value = '设置未能保存，请重试。'; preferences.value = true }
}
async function number(key: 'desktopLyric.style.opacity' | 'desktopLyric.style.backgroundOpacity' | 'desktopLyric.style.lineGap' | 'desktopLyric.style.fontSize', event: Event) { await save({ [key]: Number((event.target as HTMLInputElement).value) }) }
function resetColors() { void save({ 'desktopLyric.style.lyricUnplayColor': 'rgba(255, 255, 255, 1)', 'desktopLyric.style.lyricPlayedColor': 'rgba(7, 197, 86, 1)', 'desktopLyric.style.lyricShadowColor': 'rgba(0, 0, 0, 0.18)' }) }
function control(action: 'prev' | 'next' | 'play' | 'pause') { sendPlayerControl(action) }
</script>

<style lang="less">
.lyric-toolbar { position: absolute; top: 0; left: 0; right: 0; height: 48px; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: var(--modern-panel); color: var(--modern-text); border-bottom: 1px solid var(--modern-border); z-index: 5; box-sizing: border-box; }
.lyric-toolbar-title { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; cursor: move; touch-action: none; div { min-width: 0; strong, small { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.4; } strong { font-size: 11px; font-weight: 500; } small { font-size: 9px; color: var(--modern-muted); margin-top: 2px; } } }
.lyric-toolbar-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--modern-muted); flex: none; &.playing { background: var(--modern-accent); } }
.lyric-toolbar-buttons { display: flex; align-items: center; gap: 2px; flex: none; button { width: 27px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: var(--modern-muted); cursor: pointer; padding: 0; display: grid; place-items: center; &:hover, &.active { color: var(--modern-accent-ink); background: var(--modern-accent-soft); } svg { width: 15px; height: 15px; } &:focus-visible { outline: 2px solid var(--modern-accent); } } }
.lyric-toolbar-preferences { position: fixed; right: 16px; top: 61px; bottom: 16px; width: min(300px, calc(100vw - 32px)); overflow: auto; border-radius: 10px; border: 1px solid var(--modern-border); padding: 14px; background: var(--modern-panel); color: var(--modern-text); box-shadow: 0 12px 40px rgba(0, 0, 0, .2); cursor: default; box-sizing: border-box; font-size: 11px; }
.lyric-toolbar-preferences-heading { display: flex; align-items: center; justify-content: space-between; font-size: 12px; margin-bottom: 13px; button { display: grid; place-items: center; width: 25px; height: 25px; padding: 0; border: 0; color: var(--modern-muted); background: transparent; cursor: pointer; svg { width: 14px; height: 14px; } } }
.lyric-range { display: grid; grid-template-columns: 66px minmax(0, 1fr) 32px; align-items: center; gap: 8px; margin-bottom: 13px; input { width: 100%; min-width: 0; accent-color: var(--modern-accent); } output { text-align: right; font-size: 10px; color: var(--modern-muted); } }
.lyric-background-hint { margin: -3px 0 13px; color: var(--modern-muted); font-size: 10px; line-height: 1.5; }
.lyric-choice { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; input, select { width: 150px; min-width: 0; box-sizing: border-box; padding: 5px 7px; border: 1px solid var(--modern-border); border-radius: 5px; background: var(--modern-hover); color: var(--modern-text); font: inherit; } }
.lyric-toolbar-toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; input { width: 15px; height: 15px; accent-color: var(--modern-accent); } }
.lyric-toolbar-colors { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; > span { margin-right: auto; } input { width: 28px; height: 25px; border: 0; padding: 0; background: transparent; cursor: pointer; } button { display: grid; place-items: center; width: 25px; height: 25px; padding: 0; border: 0; border-radius: 5px; background: var(--modern-hover); color: var(--modern-muted); cursor: pointer; svg { width: 13px; height: 13px; } } }
.lyric-theme-button { display: flex; justify-content: center; align-items: center; gap: 8px; width: 100%; padding: 8px; border: 1px solid var(--modern-border); border-radius: 6px; background: var(--modern-hover); color: var(--modern-text); font: inherit; cursor: pointer; svg { width: 14px; height: 14px; } }
.lyric-toolbar-error { margin-top: 10px; font-size: 10px; color: #c66666; }
.lyric-unlock { position: absolute; top: 14px; right: 14px; z-index: 8; width: 32px; height: 32px; display: grid; place-items: center; padding: 0; border: 1px solid var(--modern-border); border-radius: 8px; background: var(--modern-panel); color: var(--modern-muted); cursor: pointer; svg { width: 16px; height: 16px; } &:hover { color: var(--modern-accent-ink); } }
@media (max-width: 500px) { .lyric-toolbar { height: 82px; flex-wrap: wrap; align-content: center; gap: 4px; padding: 5px 12px; } .lyric-toolbar-title { flex-basis: 100%; } .lyric-toolbar-buttons { width: 100%; justify-content: space-between; } .lyric-toolbar-preferences { top: 95px; } }
</style>

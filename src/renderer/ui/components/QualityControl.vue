<template>
  <div class="ui-quality-control">
    <button ref="trigger" type="button" class="ui-icon-button ui-quality-trigger" :class="{ 'ui-active': open }" :aria-label="`切换音质，${streamSummary}`" :title="streamSummary" aria-haspopup="dialog" :aria-expanded="open" :aria-controls="panelId" :disabled="!track || track.source === 'local'" @click="toggle" @keydown="onTriggerKeydown"><UiIcon name="quality" /></button>
    <Teleport to="body">
      <section v-if="open" :id="panelId" ref="panel" class="ui-quality-panel scroll" role="dialog" aria-modal="false" aria-label="播放音质" :style="position" @keydown="onPanelKeydown">
        <header><div><strong>播放音质</strong><span>{{ platformLabel }}</span></div><button type="button" class="ui-icon-button" aria-label="关闭音质设置" @click="close(true)"><UiIcon name="close" /></button></header>
        <p v-if="stream" class="ui-quality-current" role="status">实际播放 · {{ qualityLabels[stream.quality ?? stream.type] }}<small v-if="streamDetails">{{ streamDetails }}</small></p>
        <p v-else class="ui-quality-current">{{ streamSummary }}</p>
        <div class="ui-quality-options" role="radiogroup" aria-label="选择播放音质">
          <button v-for="quality in options" :key="quality" type="button" role="radio" :aria-checked="preferredQuality === quality" :data-quality="quality" :disabled="changing" :class="{ selected: preferredQuality === quality }" @click="choose(quality)"><span>{{ qualityLabels[quality] }}<small v-if="quality === 'auto'">默认 · 自动选择账号与歌曲允许的最高音质</small></span><UiIcon v-if="preferredQuality === quality" name="check" /></button>
        </div>
        <p v-if="loading || changing" class="ui-quality-note" role="status">{{ changing ? '正在切换，保留当前播放进度…' : '正在查询这首歌的可用音质…' }}</p>
        <p v-if="error" class="ui-quality-error" role="status">{{ error }}</p>
        <p v-else class="ui-quality-note">{{ unavailablePreference ? `此曲暂无${qualityLabels[preferredQuality]}，会选择可用音质。` : '可用音质由平台、账号权限与歌曲版权决定。' }}</p>
      </section>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { qualityLabels, type PlatformQuality } from '@common/platformPlayback'
import { sourceNames } from '@renderer/store'
import { activeStream, getPlatformQualitys, preferredQuality, qualityChanging, qualityChangeError, setPreferredQuality } from '../services/platformPlayback'
import UiIcon from './UiIcon.vue'

const props = defineProps<{ track: LX.Music.MusicInfo | null }>()
const panelId = `ui-quality-panel-${crypto.randomUUID()}`
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const open = ref(false)
const loading = ref(false)
const saving = ref(false)
const changing = computed(() => saving.value || qualityChanging.value)
const queryError = ref('')
const error = computed(() => queryError.value || qualityChangeError.value)
const qualitys = ref<PlatformQuality[]>([])
const position = ref<Record<string, string>>({ visibility: 'hidden' })
const options = computed<PlatformQuality[]>(() => ['auto', ...qualitys.value.filter(quality => quality !== 'auto')])
const unavailablePreference = computed(() => preferredQuality.value !== 'auto' && !options.value.includes(preferredQuality.value))
const stream = computed(() => activeStream.value?.trackId === props.track?.id ? activeStream.value : null)
const qualityTrack = computed(() => stream.value?.musicInfo ?? props.track)
const platformNames: Record<string, string> = { qq: 'QQ 音乐', tx: 'QQ 音乐', netease: '网易云音乐', wy: '网易云音乐', kugou: '酷狗音乐', kg: '酷狗音乐', kuwo: '酷我音乐', kw: '酷我音乐', migu: '咪咕音乐', mg: '咪咕音乐', bilibili: '哔哩哔哩', bi: '哔哩哔哩' }
const platformLabel = computed(() => {
  if (stream.value) return platformNames[stream.value.platform] ?? stream.value.platform
  const track: LX.Music.MusicInfo | null = props.track
  return track?.source === 'local' ? '本地音乐' : track ? sourceNames.value[track.source] : '选择歌曲后可切换'
})
const streamSummary = computed(() => {
  if (!props.track) return '选择歌曲后可切换音质'
  if (props.track.source === 'local') return '本地文件音质由音频文件决定'
  return stream.value ? `${platformLabel.value} · ${qualityLabels[stream.value.quality ?? stream.value.type]}` : `音质偏好 · ${qualityLabels[preferredQuality.value]}`
})
const streamDetails = computed(() => {
  const details: string[] = []
  if (stream.value?.bitDepth) details.push(`${stream.value.bitDepth} bit`)
  if (stream.value?.sampleRate) details.push(`${Number((stream.value.sampleRate / 1000).toFixed(1))} kHz`)
  if (stream.value?.bitrate) details.push(`${Math.round(stream.value.bitrate / 1000)} kbps`)
  return details.join(' · ')
})
let qualityRequestId = 0

function metadataQualitys(track: LX.Music.MusicInfo): PlatformQuality[] {
  if (track.source === 'local') return []
  return track.meta.qualitys.map(quality => quality.type).filter(quality => quality in qualityLabels)
}
async function loadQualitys() {
  const requestId = ++qualityRequestId
  const track = qualityTrack.value
  queryError.value = ''
  qualitys.value = track ? metadataQualitys(track) : []
  if (!track || track.source === 'local') { loading.value = false; return }
  loading.value = true
  try {
    const result = await getPlatformQualitys(track)
    if (requestId !== qualityRequestId) return
    qualitys.value = [...new Set(result.filter(quality => quality in qualityLabels))]
  } catch (err) {
    if (requestId === qualityRequestId) queryError.value = err instanceof Error ? err.message : '暂时无法查询平台音质，先使用歌曲已有的音质信息。'
  } finally { if (requestId === qualityRequestId) loading.value = false }
}
watch(() => `${props.track?.source}:${props.track?.id}__${qualityTrack.value?.source}:${qualityTrack.value?.id}`, () => { void loadQualitys() }, { immediate: true })
watch([qualitys, loading, changing, error], async() => { if (open.value) { await nextTick(); place() } })

function place() {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect || !panel.value) return
  const width = Math.min(270, window.innerWidth - 16)
  const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
  const height = panel.value.offsetHeight
  const top = Math.max(8, Math.min(rect.top - height - 8, window.innerHeight - height - 8))
  position.value = { left: `${left}px`, top: `${top}px`, width: `${width}px` }
}
function close(restoreFocus = false) {
  open.value = false
  document.removeEventListener('pointerdown', outside, true)
  document.removeEventListener('scroll', place, true)
  window.removeEventListener('resize', place)
  if (restoreFocus) trigger.value?.focus()
}
function outside(event: Event) {
  const target = event.target as Node
  if (!trigger.value?.contains(target) && !panel.value?.contains(target)) close()
}
async function toggle() {
  if (open.value) { close(true); return }
  if (!props.track || props.track.source === 'local') return
  position.value = { visibility: 'hidden' }
  open.value = true
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('scroll', place, true)
  window.addEventListener('resize', place)
  await nextTick()
  if (!open.value) return
  place()
  panel.value?.querySelector<HTMLButtonElement>('button[aria-checked="true"]')?.focus()
}
async function choose(quality: PlatformQuality) {
  if (changing.value || !props.track || props.track.source === 'local') return
  if (preferredQuality.value === quality && !qualityChangeError.value) { close(true); return }
  saving.value = true
  queryError.value = ''
  try {
    await setPreferredQuality(quality)
    close(true)
  } catch (err) { queryError.value = err instanceof Error ? err.message : '切换音质失败，请重试。' } finally { saving.value = false }
}
function onTriggerKeydown(event: KeyboardEvent) {
  if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); if (!open.value) void toggle() } else if (event.key === 'Escape' && open.value) { event.preventDefault(); event.stopPropagation(); close(true) }
}
function onPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  const buttons = Array.from(panel.value?.querySelectorAll<HTMLButtonElement>('button[data-quality]:not(:disabled)') ?? [])
  if (!buttons.length) return
  event.preventDefault()
  event.stopPropagation()
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
  buttons[index].focus()
}
onBeforeUnmount(() => { qualityRequestId++; close() })
</script>

<style lang="less">
.ui-quality-control { display: flex; align-items: center; flex: none; }
.ui-quality-trigger[aria-expanded='true'] { color: var(--modern-accent-ink); background: var(--modern-accent-soft); }
.ui-quality-trigger .ui-svg-icon { width: 18px; height: 18px; }
.ui-quality-panel { position: fixed; z-index: 2600; max-height: calc(100vh - 16px); padding: 13px 8px 10px; overflow: auto; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); background: var(--modern-panel); color: var(--modern-text); box-shadow: 0 16px 42px #0003; -webkit-app-region: no-drag; header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 5px 9px; strong { display: block; font-size: 12px; font-weight: 550; } span { display: block; margin-top: 4px; color: var(--modern-muted); font-size: 10px; } } }
.ui-quality-current { margin: 0 5px 9px; padding: 9px; color: var(--modern-accent-ink); background: var(--modern-accent-soft); border-radius: 8px; font-size: 10px; line-height: 1.6; small { display: block; color: var(--modern-muted); font-size: 9px; } }
.ui-quality-options { display: flex; flex-direction: column; gap: 3px; button { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 32px; padding: 8px 9px; border: 0; border-radius: 8px; color: inherit; background: transparent; text-align: left; font: inherit; font-size: 11px; cursor: pointer; small { display: block; margin-top: 4px; color: var(--modern-muted); font-size: 9px; } .ui-svg-icon { width: 15px; height: 15px; } &:hover, &:focus-visible { background: var(--modern-hover); } &.selected { color: var(--modern-accent-ink); background: var(--modern-accent-soft); } } }
.ui-quality-note, .ui-quality-error { margin: 9px 6px 0; color: var(--modern-muted); font-size: 9px; line-height: 1.6; }
.ui-quality-error { color: #c66666; }
</style>

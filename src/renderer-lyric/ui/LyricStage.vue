<template>
  <div ref="stage" class="lyric-stage" :class="classes" :style="styles" @wheel="handleWheel" @pointerdown="holdScroll">
    <div v-show="lyric.lines.length" ref="flow" class="lyric-stage-flow" />
    <div v-if="!lyric.lines.length" class="lyric-stage-empty"><span>♫</span><strong>{{ musicInfo.id ? musicInfo.name : '让音乐，陪伴此刻' }}</strong><p>{{ musicInfo.id ? '这首音乐暂时没有歌词' : '播放一首歌，歌词会出现在这里' }}</p></div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { lyric } from '@lyric/store/lyric'
import { musicInfo, setting } from '@lyric/store/state'
const stage = ref<HTMLDivElement | null>(null)
const flow = ref<HTMLDivElement | null>(null)
const space = ref(120)
const vertical = computed(() => setting['desktopLyric.direction'] === 'vertical')
const classes = computed(() => ({ vertical: vertical.value, zoom: setting['desktopLyric.style.isZoomActiveLrc'], ellipsis: setting['desktopLyric.style.ellipsis'], 'bold-font': setting['desktopLyric.style.isFontWeightFont'], 'bold-line': setting['desktopLyric.style.isFontWeightLine'], 'bold-extended': setting['desktopLyric.style.isFontWeightExtended'] }))
const styles = computed(() => ({ fontFamily: setting['desktopLyric.style.font'] || 'inherit', fontSize: `${setting['desktopLyric.style.fontSize']}px`, textAlign: setting['desktopLyric.style.align'], opacity: setting['desktopLyric.style.opacity'] / 100, '--lyric-gap': `${setting['desktopLyric.style.lineGap']}px`, '--lyric-space': `${space.value}px` }))
let observer: ResizeObserver | null = null
let delay: ReturnType<typeof setTimeout> | null = null
let resume: ReturnType<typeof setTimeout> | null = null
let manuallyScrolling = false
function scrollActive(smooth = true) {
  const container = stage.value
  const line = lyric.lines[lyric.line]?.dom_line
  if (!container || !line || manuallyScrolling) return
  const bounds = line.getBoundingClientRect()
  const viewport = container.getBoundingClientRect()
  const start = setting['desktopLyric.scrollAlign'] === 'top'
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  container.scrollBy({ top: vertical.value ? 0 : bounds.top - viewport.top - (start ? 16 : (container.clientHeight - bounds.height) / 2), left: vertical.value ? bounds.left - viewport.left - (start ? container.clientWidth - bounds.width - 16 : (container.clientWidth - bounds.width) / 2) : 0, behavior: smooth && !reduced ? 'smooth' : 'auto' })
}
async function mountLines() {
  await nextTick()
  if (!flow.value) return
  const fragment = document.createDocumentFragment()
  for (const line of lyric.lines) fragment.appendChild(line.dom_line)
  flow.value.replaceChildren(fragment)
  manuallyScrolling = false
  scrollActive(false)
}
function scheduleScroll() {
  if (delay) clearTimeout(delay)
  delay = setTimeout(() => { delay = null; scrollActive() }, setting['desktopLyric.isDelayScroll'] ? 450 : 0)
}
function holdScroll(event: PointerEvent) { if ((event.target as HTMLElement).closest('.line-content')) stopAutoScroll() }
function stopAutoScroll() { manuallyScrolling = true; if (resume) clearTimeout(resume); resume = setTimeout(() => { manuallyScrolling = false; resume = null; scrollActive() }, 3000) }
function handleWheel(event: WheelEvent) { stopAutoScroll(); if (vertical.value && stage.value) { event.preventDefault(); stage.value.scrollLeft -= event.deltaY } }
watch(() => lyric.lines, mountLines, { flush: 'post' })
watch(() => lyric.line, scheduleScroll)
watch(() => [setting['desktopLyric.direction'], setting['desktopLyric.style.fontSize'], setting['desktopLyric.style.lineGap'], setting['desktopLyric.style.isZoomActiveLrc']], async() => { await nextTick(); resize(); scrollActive(false) })
function resize() { if (stage.value) space.value = (vertical.value ? stage.value.clientWidth : stage.value.clientHeight) / 2 }
onMounted(() => { resize(); observer = new ResizeObserver(() => { resize(); scrollActive(false) }); if (stage.value) observer.observe(stage.value); void mountLines() })
onBeforeUnmount(() => { observer?.disconnect(); if (delay) clearTimeout(delay); if (resume) clearTimeout(resume) })
</script>

<style lang="less">
.lyric-stage { position: absolute; inset: 48px 0 20px; overflow: auto; overscroll-behavior: contain; color: var(--color-lyric-unplay); scrollbar-width: none; mask-image: linear-gradient(transparent, #000 13%, #000 85%, transparent); &::-webkit-scrollbar { width: 0; height: 0; } }
.lyric-window.locked .lyric-stage { inset: 0; }
.lyric-stage-flow { padding: var(--lyric-space) 20px; box-sizing: border-box; min-height: 100%; }
.lyric-stage .line-content { line-height: 1.55; margin: var(--lyric-gap) 0; overflow-wrap: break-word; opacity: .55; transition: opacity .25s, font-size .25s; &.active { opacity: 1; } .font-lrc { color: var(--color-lyric-unplay); text-shadow: 0 1px 4px var(--color-lyric-shadow); } .shadow { color: transparent; } .extended { display: inline-block; margin-top: 4px; font-size: .68em; line-height: 1.4; } &.line-mode.active .font-lrc, &.font-mode.played .font-lrc { color: var(--color-lyric-played); } &.font-mode > .line > .font-lrc > span { background-color: var(--color-lyric-unplay); background-image: linear-gradient(to right, var(--color-lyric-played), var(--color-lyric-played)); background-size: 0 100%; background-repeat: no-repeat; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; padding: .1em; margin: -.1em; text-shadow: none; } }
.lyric-stage.vertical { writing-mode: vertical-rl; mask-image: linear-gradient(to left, transparent, #000 13%, #000 85%, transparent); .lyric-stage-flow { padding: 18px var(--lyric-space); min-width: 100%; min-height: 100%; } .line-content { margin: 0 var(--lyric-gap); max-height: 100%; .extended { margin: 0 4px 0 0; } &.font-mode > .line > .font-lrc > span { background-image: linear-gradient(to bottom, var(--color-lyric-played), var(--color-lyric-played)); background-size: 100% 0; } } }
.lyric-stage.zoom .line-content.active > .line { font-size: 1.16em; }
.lyric-stage.bold-font .font-mode > .line, .lyric-stage.bold-line .line-mode > .line, .lyric-stage.bold-extended .extended { font-weight: 600; }
.lyric-stage.ellipsis .font-lrc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: calc(100vw - 50px); }
.lyric-stage-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--color-lyric-unplay); text-align: center; writing-mode: horizontal-tb; padding: 25px; > span { width: 45px; height: 45px; display: grid; place-items: center; border-radius: 14px; background: var(--modern-accent-soft); color: var(--modern-accent-ink); font-size: 25px; margin-bottom: 2px; } strong { font-size: .85em; font-weight: 500; } p { font-size: .55em; opacity: .5; } }
</style>

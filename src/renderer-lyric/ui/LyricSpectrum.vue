<template><canvas ref="canvas" class="lyric-spectrum" aria-hidden="true" /></template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { isPlay } from '@lyric/store/state'
import { getAnalyserDataArray, useEvent } from '@lyric/core/mainWindowChannel'
const canvas = ref<HTMLCanvasElement | null>(null)
let frame = 0
let ready = false
let observer: ResizeObserver | null = null
function request() { if (ready && isPlay.value) getAnalyserDataArray() }
useEvent(event => {
  if (event.action !== 'send_analyser_data_array' || !canvas.value) return
  const context = canvas.value.getContext('2d')
  if (!context) return
  const width = canvas.value.width
  const height = canvas.value.height
  context.clearRect(0, 0, width, height)
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--modern-accent').trim() || '#638575'
  const count = Math.min(48, event.data.length)
  const gap = width / count
  for (let index = 0; index < count; index++) {
    const bar = event.data[Math.floor(index * event.data.length / count)] / 255 * height * 0.55
    context.fillRect(index * gap + 2, height - bar, Math.max(2, gap - 4), bar)
  }
  if (frame) cancelAnimationFrame(frame)
  if (isPlay.value && ready) frame = requestAnimationFrame(request)
})
function resize() { if (canvas.value) { canvas.value.width = canvas.value.clientWidth; canvas.value.height = canvas.value.clientHeight } }
watch(isPlay, playing => { if (playing) request(); else cancelAnimationFrame(frame) })
onMounted(() => { ready = true; resize(); observer = new ResizeObserver(resize); if (canvas.value) observer.observe(canvas.value); request() })
onBeforeUnmount(() => { ready = false; cancelAnimationFrame(frame); observer?.disconnect() })
</script>
<style lang="less">.lyric-spectrum { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .13; pointer-events: none; }</style>

<template>
  <div class="ui-volume-control">
    <button ref="trigger" type="button" class="ui-icon-button ui-volume-control__trigger" aria-label="音量设置" aria-haspopup="dialog" :aria-expanded="open" :aria-controls="panelId" @click="toggle" @keydown="onTriggerKeydown">
      <UiIcon :name="isMute ? 'mute' : 'volume'" />
    </button>

    <Teleport to="body">
      <div v-if="open" :id="panelId" ref="panel" class="ui-volume-panel" role="dialog" aria-modal="false" aria-label="音量设置" :style="position" @keydown="onPanelKeydown">
        <output class="ui-volume-panel__value" aria-live="polite">{{ percentage }}%</output>
        <div class="ui-volume-panel__range">
          <UiRange vertical :model-value="volume" :min="0" :max="1" :step="0.01" aria-label="音量" @input="setVolume" />
        </div>
        <button type="button" class="ui-volume-panel__mute" :aria-pressed="isMute" aria-label="静音" @click="setMute(!isMute)">
          <UiIcon :name="isMute ? 'mute' : 'volume'" />
          <span>{{ isMute ? '已静音' : '静音' }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { isMute, setMute, setVolume, volume } from '@renderer/store/player/volume'
import UiIcon from './UiIcon.vue'
import UiRange from './UiRange.vue'

const panelId = `ui-volume-panel-${crypto.randomUUID()}`
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const open = ref(false)
const position = ref<Record<string, string>>({})
const percentage = computed(() => Math.round(Math.max(0, Math.min(1, volume.value)) * 100))

function place() {
  const triggerRect = trigger.value?.getBoundingClientRect()
  const panelElement = panel.value
  if (!triggerRect || !panelElement) return
  const gap = 8
  const panelWidth = Math.min(94, Math.max(76, panelElement.offsetWidth || 86))
  const panelHeight = panelElement.offsetHeight
  const left = Math.max(8, Math.min(triggerRect.left + (triggerRect.width - panelWidth) / 2, window.innerWidth - panelWidth - 8))
  const preferredTop = triggerRect.top - panelHeight - gap
  const top = Math.max(8, Math.min(preferredTop, window.innerHeight - panelHeight - 8))
  position.value = { left: `${left}px`, top: `${top}px`, width: `${panelWidth}px` }
}

function removeListeners() {
  document.removeEventListener('click', outside, true)
  document.removeEventListener('scroll', place, true)
  window.removeEventListener('resize', place)
}

function close(restoreFocus = false) {
  open.value = false
  removeListeners()
  if (restoreFocus) trigger.value?.focus()
}

function outside(event: Event) {
  const target = event.target as Node
  if (!trigger.value?.contains(target) && !panel.value?.contains(target)) {
    const element = event.target instanceof Element ? event.target : null
    if (!element?.closest('button, a, input, select, textarea, [role="button"], [role="link"]')) event.preventDefault()
    close(true)
  }
}

async function openPanel() {
  if (open.value) return
  open.value = true
  document.addEventListener('click', outside, true)
  document.addEventListener('scroll', place, true)
  window.addEventListener('resize', place)
  await nextTick()
  if (!open.value) return
  place()
  panel.value?.querySelector<HTMLInputElement>('input[aria-label="音量"]')?.focus()
}

function toggle() {
  if (open.value) close(true)
  else void openPanel()
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    event.stopPropagation()
    toggle()
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    event.stopPropagation()
    if (!open.value) void openPanel()
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    event.stopPropagation()
    close(true)
  }
}

function onPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close(true)
    return
  }
  if (event.key !== 'Tab') return
  const focusables = Array.from(panel.value?.querySelectorAll<HTMLElement>('input, button, [tabindex]:not([tabindex="-1"])') ?? []).filter(element => !element.hasAttribute('disabled'))
  const current = document.activeElement
  const index = focusables.indexOf(current as HTMLElement)
  if (event.shiftKey && index <= 0) {
    event.preventDefault()
    close(true)
  } else if (!event.shiftKey && index === focusables.length - 1) {
    event.preventDefault()
    const scope = trigger.value?.closest('.ui-player-detail') ?? document
    const outsideControls = Array.from(scope.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')).filter(element => element.tabIndex >= 0 && !element.hasAttribute('disabled') && !panel.value?.contains(element) && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
    const triggerIndex = outsideControls.indexOf(trigger.value!)
    const nextControl = outsideControls[(triggerIndex + 1) % outsideControls.length]
    close()
    void nextTick(() => { nextControl?.focus() })
  }
}

onBeforeUnmount(() => { close() })
</script>

<style lang="less">
.ui-volume-control { position: relative; display: flex; align-items: center; }
.ui-volume-control__trigger { color: var(--modern-muted); }
.ui-volume-control__trigger[aria-expanded='true'] { color: var(--modern-accent-ink); background: var(--modern-accent-soft); }
.ui-volume-panel { position: fixed; z-index: 2600; display: flex; flex-direction: column; align-items: center; gap: 10px; min-height: 170px; max-height: min(300px, calc(100vh - 16px)); padding: 13px 10px 10px; overflow: hidden; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); background: var(--modern-panel); color: var(--modern-text); box-shadow: 0 16px 42px #0003; -webkit-app-region: no-drag; }
.ui-volume-panel__value { color: var(--modern-accent-ink); font-size: 12px; font-variant-numeric: tabular-nums; }
.ui-volume-panel__range { display: flex; align-items: center; justify-content: center; min-height: 150px; flex: 1; }
.ui-volume-panel__range .ui-range { width: 18px; }
.ui-volume-panel__mute { display: flex; align-items: center; justify-content: center; gap: 5px; width: 100%; min-height: 30px; padding: 5px 4px; border: 0; border-radius: 7px; background: transparent; color: var(--modern-muted); font-size: 10px; cursor: pointer; }
.ui-volume-panel__mute:hover, .ui-volume-panel__mute[aria-pressed='true'] { color: var(--modern-accent-ink); background: var(--modern-accent-soft); }
.ui-volume-panel__mute svg { width: 14px; height: 14px; }
</style>

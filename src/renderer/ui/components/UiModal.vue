<template>
  <Teleport to="body">
    <Transition name="ui-dialog">
      <div v-if="show" class="ui-dialog-backdrop" @click.self="emit('close')">
        <section ref="panel" class="ui-dialog-panel" :style="{ width }" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1" @keydown="handleKeydown">
          <header class="ui-dialog-heading"><div><h2>{{ title }}</h2><p v-if="subtitle">{{ subtitle }}</p></div><button type="button" class="ui-dialog-close" aria-label="关闭对话框" @click="emit('close')"><UiIcon name="close" /></button></header>
          <div class="ui-dialog-content scroll"><slot /></div>
          <footer v-if="$slots.footer" class="ui-dialog-footer"><slot name="footer" /></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import UiIcon from '@renderer/ui/components/UiIcon.vue'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
const props = withDefaults(defineProps<{ show: boolean, title: string, subtitle?: string, width?: string }>(), { subtitle: '', width: '420px' })
const emit = defineEmits<(event: 'close') => void>()
const panel = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); return }
  if (event.key !== 'Tab') return
  const elements = panel.value?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex="0"]')
  if (!elements?.length) return
  const first = elements[0]
  const last = elements[elements.length - 1]
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
watch(() => props.show, async show => {
  if (show) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    const autofocus = panel.value?.querySelector<HTMLElement>('[autofocus]')
    if (autofocus) autofocus.focus()
    else panel.value?.focus()
  } else { previousFocus?.focus(); previousFocus = null }
}, { immediate: true })
onBeforeUnmount(() => previousFocus?.focus())
</script>

<style lang="less">
.ui-dialog-backdrop { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--modern-overlay); backdrop-filter: blur(6px); box-sizing: border-box; -webkit-app-region: no-drag; }
.ui-dialog-panel { max-width: 100%; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; color: var(--modern-text); background: var(--modern-panel); border: 1px solid var(--modern-border); border-radius: var(--modern-radius); box-shadow: 0 24px 90px rgba(0, 0, 0, .2); outline: none; font-family: inherit; }
.ui-dialog-heading { padding: 22px 24px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--modern-border); flex: none; h2 { font-size: 18px; font-weight: 600; line-height: 1.4; } p { margin-top: 5px; color: var(--modern-muted); font-size: 12px; line-height: 1.5; } }
.ui-dialog-close { display: grid; place-items: center; flex: none; border: 0; padding: 0; background: var(--modern-hover); color: var(--modern-muted); width: 28px; height: 28px; border-radius: 50%; font-size: 21px; cursor: pointer; line-height: 1; &:hover { color: var(--modern-text); } }
.ui-dialog-content { padding: 24px; overflow: auto; min-height: 0; font-size: 13px; line-height: 1.6; }
.ui-dialog-footer { padding: 16px 24px; display: flex; justify-content: flex-end; gap: 8px; flex: none; border-top: 1px solid var(--modern-border); }
.ui-dialog-panel button:focus-visible, .ui-dialog-panel input:focus-visible { outline: 2px solid var(--modern-accent); outline-offset: 2px; }
.ui-dialog-button { border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); padding: 9px 17px; background: var(--modern-panel); color: var(--modern-text); font-size: 12px; cursor: pointer; &:hover { background: var(--modern-hover); } &:disabled { opacity: .45; cursor: default; } }
.ui-dialog-button-primary { background: var(--modern-text); color: var(--modern-panel); border-color: transparent; &:hover { opacity: .85; background: var(--modern-text); } }
.ui-dialog-button-danger { color: #c66666; background: rgba(197, 78, 78, .08); border-color: transparent; }
.ui-dialog-field { display: block; margin-bottom: 18px; > span { display: block; margin-bottom: 7px; color: var(--modern-muted); font-size: 12px; } input, select { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); background: var(--modern-bg); color: var(--modern-text); font-family: inherit; font-size: 13px; } }
.ui-dialog-error { padding: 10px 12px; background: rgba(197, 78, 78, .08); color: #c66666; border-radius: 10px; font-size: 12px; margin-bottom: 14px; }
.ui-dialog-note { color: var(--modern-muted); font-size: 12px; line-height: 1.7; }
.ui-dialog-enter-active, .ui-dialog-leave-active { transition: opacity .18s; .ui-dialog-panel { transition: transform .2s; } }
.ui-dialog-enter-from, .ui-dialog-leave-to { opacity: 0; .ui-dialog-panel { transform: translateY(12px) scale(.98); } }
</style>

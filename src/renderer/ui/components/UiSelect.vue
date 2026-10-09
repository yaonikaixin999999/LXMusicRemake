<template>
  <div class="ui-select" :class="{ 'ui-select-open': open }">
    <button :id="id" ref="trigger" type="button" class="ui-select-trigger" role="combobox" :aria-label="ariaLabel" :aria-expanded="open" :aria-controls="menuId" aria-haspopup="listbox" :disabled="disabled" @click="toggle" @keydown="onKey"><span>{{ selected?.label ?? placeholder }}</span><UiIcon name="chevronDown" /></button>
    <Teleport to="body"><div v-if="open" :id="menuId" ref="menu" class="ui-select-menu scroll" role="listbox" :aria-label="ariaLabel" :style="position" @keydown="onKey"><template v-for="(option, index) in options" :key="`${option.value}-${index}`"><div v-if="option.group && option.group !== options[index - 1]?.group" class="ui-select-group">{{ option.group }}</div><button type="button" role="option" :aria-selected="same(option.value, modelValue)" :disabled="option.disabled" :class="{ selected: same(option.value, modelValue), focused: index === focused }" :data-index="index" @pointermove="focused = index" @click="choose(index)"><span>{{ option.label }}</span><UiIcon v-if="same(option.value, modelValue)" name="check" /></button></template></div></Teleport>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import UiIcon from './UiIcon.vue'
export interface SelectOption { value: string | number, label: string, disabled?: boolean, group?: string }
interface SelectProps { modelValue: string | number, options: SelectOption[], id?: string, ariaLabel?: string, disabled?: boolean, placeholder?: string }
const props: SelectProps = withDefaults(defineProps<SelectProps>(), { id: undefined, ariaLabel: undefined, disabled: false, placeholder: '请选择' })
const emit = defineEmits<{ 'update:modelValue': [value: string | number], change: [value: string | number] }>()
const menuId = `ui-select-${crypto.randomUUID()}`
const trigger = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const open = ref(false)
const focused = ref(-1)
const position = ref<Record<string, string>>({})
const same = (a: string | number, b: string | number) => String(a) === String(b)
const selected = computed(() => props.options.find(option => same(option.value, props.modelValue)))
function place() {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect) return
  const below = window.innerHeight - rect.bottom - 12
  const above = rect.top - 12
  const upwards = below < 200 && above > below
  position.value = { left: `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`, width: `${rect.width}px`, maxHeight: `${Math.min(300, upwards ? above - 6 : below - 6)}px`, ...(upwards ? { bottom: `${window.innerHeight - rect.top + 6}px` } : { top: `${rect.bottom + 6}px` }) }
}
function close(restoreFocus = false) {
  open.value = false
  document.removeEventListener('pointerdown', outside, true)
  window.removeEventListener('resize', place)
  document.removeEventListener('scroll', place, true)
  if (restoreFocus) trigger.value?.focus()
}
function outside(event: Event) { const target = event.target as Node; if (!trigger.value?.contains(target) && !menu.value?.contains(target)) close() }
async function toggle() {
  if (open.value) { close(); return }
  if (props.disabled) return
  focused.value = props.options.findIndex(option => same(option.value, props.modelValue) && !option.disabled)
  if (focused.value < 0) focused.value = props.options.findIndex(option => !option.disabled)
  place()
  open.value = true
  document.addEventListener('pointerdown', outside, true)
  window.addEventListener('resize', place)
  document.addEventListener('scroll', place, true)
  await nextTick()
  focusOption()
}
function focusOption() { const option = menu.value?.querySelector<HTMLElement>(`[data-index="${focused.value}"]`); option?.focus(); option?.scrollIntoView({ block: 'nearest' }) }
function choose(index: number) {
  const option = props.options[index]
  if (!option || option.disabled) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  close(true)
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
  if (event.key === 'Tab') { close(true); return }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); event.stopPropagation()
    if (!open.value) { void toggle(); return }
    const enabled = props.options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0)
    if (!enabled.length) return
    const current = enabled.indexOf(focused.value)
    focused.value = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled[enabled.length - 1] : enabled[(current + (event.key === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length]
    focusOption()
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault(); event.stopPropagation()
    if (open.value) choose(focused.value)
    else void toggle()
  }
}
onBeforeUnmount(() => { close() })
</script>
<style lang="less">
.ui-select { min-width: 0; }
.ui-select-trigger { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 36px; padding: 9px 12px; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); background: var(--modern-hover); color: var(--modern-text); font: inherit; font-size: 11px; text-align: left; span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } svg { width: 15px; height: 15px; } &:hover { background: var(--modern-accent-soft); } }
.ui-select-open .ui-select-trigger { border-color: var(--modern-accent); }
.ui-select-menu { position: fixed; z-index: 2500; overflow: auto; padding: 5px; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); background: var(--modern-panel); color: var(--modern-text); box-shadow: 0 12px 36px #0002; -webkit-app-region: no-drag; button { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 35px; border: 0; border-radius: 7px; padding: 8px 10px; background: transparent; color: inherit; font: inherit; font-size: 11px; text-align: left; svg { width: 15px; height: 15px; } &.selected { color: var(--modern-accent-ink); background: var(--modern-accent-soft); } &.focused, &:hover { background: var(--modern-hover); } &:focus-visible { outline: 1px solid var(--modern-accent); outline-offset: -1px; } } }
.ui-select-group { padding: 8px 10px 5px; font-size: 10px; color: var(--modern-muted); }
</style>

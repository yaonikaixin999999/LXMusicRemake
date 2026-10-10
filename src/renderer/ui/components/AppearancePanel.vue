<template>
  <Teleport to="body">
    <Transition name="appearance-float">
      <div v-if="appearancePanelOpen" class="appearance-overlay" @click.self="close">
        <section ref="panel" class="appearance-panel" role="dialog" aria-modal="true" aria-labelledby="appearance-title" tabindex="-1" @keydown="handleKeydown">
          <header class="appearance-header">
            <div>
              <span class="appearance-eyebrow">MAKE IT YOURS</span>
              <h2 id="appearance-title">你的音乐，你的风格</h2>
              <p>把这里调整成最自在的样子。</p>
            </div>
            <button class="appearance-close" type="button" aria-label="关闭外观设置" @click="close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </header>

          <div class="appearance-body scroll">
            <fieldset class="appearance-section">
              <legend>外观主题</legend>
              <div class="appearance-modes">
                <button v-for="mode in modes" :key="mode.value" type="button" class="appearance-mode" :class="{ selected: appearance.mode === mode.value }" :aria-pressed="appearance.mode === mode.value" @click="appearance.mode = mode.value">
                  <span class="appearance-mode-preview" :class="mode.value" aria-hidden="true"><i /><i /><i /></span>
                  <span>{{ mode.label }}</span>
                  <svg v-if="appearance.mode === mode.value" class="appearance-mode-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4 10-10" /></svg>
                </button>
              </div>
            </fieldset>

            <fieldset class="appearance-section">
              <legend>点缀颜色 <span class="appearance-value">{{ appearance.accent.toUpperCase() }}</span></legend>
              <div class="appearance-colors">
                <button v-for="swatch in swatches" :key="swatch.color" type="button" class="appearance-swatch" :class="{ selected: appearance.accent === swatch.color }" :style="{ '--swatch': swatch.color }" :aria-label="swatch.label" :aria-pressed="appearance.accent === swatch.color" @click="appearance.accent = swatch.color">
                  <svg v-if="appearance.accent === swatch.color" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4 10-10" /></svg>
                </button>
                <label class="appearance-custom-color" title="选择自定义颜色">
                  <input :value="appearance.accent" type="color" aria-label="自定义点缀颜色" @input="handleAccentInput">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                </label>
              </div>
            </fieldset>

            <div class="appearance-section">
              <label class="appearance-label" for="appearance-radius">面板圆角 <span class="appearance-value">{{ appearance.radius }} px</span></label>
              <input id="appearance-radius" :value="appearance.radius" class="appearance-range" type="range" min="8" max="28" step="1" @input="handleRadiusInput">
              <div class="appearance-range-labels"><span>利落</span><span>柔和</span></div>
            </div>

            <div class="appearance-section">
              <label class="appearance-label" for="appearance-panel-gap">浮动面板间距 <span class="appearance-value">{{ appearance.panelGap }} px</span></label>
              <input id="appearance-panel-gap" :value="appearance.panelGap" class="appearance-range" type="range" min="4" max="32" step="1" @input="handlePanelGapInput">
              <div class="appearance-range-labels"><span>紧密</span><span>宽松</span></div>
            </div>

            <fieldset class="appearance-section">
              <legend>列表密度</legend>
              <div class="appearance-density">
                <button type="button" :class="{ selected: appearance.density === 'comfortable' }" :aria-pressed="appearance.density === 'comfortable'" @click="appearance.density = 'comfortable'">舒适</button>
                <button type="button" :class="{ selected: appearance.density === 'compact' }" :aria-pressed="appearance.density === 'compact'" @click="appearance.density = 'compact'">紧凑</button>
              </div>
            </fieldset>

            <div class="appearance-section appearance-toggle-row">
              <div><label id="appearance-explore-label">显示发现推荐</label><p>在发现页展示氛围与灵感卡片</p></div>
              <button type="button" class="appearance-toggle" role="switch" :aria-checked="appearance.showExplore" aria-labelledby="appearance-explore-label" @click="appearance.showExplore = !appearance.showExplore"><span /></button>
            </div>

            <div class="appearance-live-preview" aria-hidden="true">
              <div class="appearance-preview-art"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l11-2v13M9 8l11-2" /><ellipse cx="6" cy="18" rx="3" ry="2.5" /><ellipse cx="17" cy="16" rx="3" ry="2.5" /></svg></div>
              <div><strong>留一点时间，给音乐</strong><span>实时预览 · 即刻生效</span></div>
              <span class="appearance-preview-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="m9 6 10 6-10 6z" /></svg></span>
            </div>
          </div>
          <footer class="appearance-footer">
            <button type="button" class="appearance-reset" @click="resetAppearance">恢复默认</button>
            <button type="button" class="appearance-done" @click="close">完成</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { appearance, appearancePanelOpen, resetAppearance, type Appearance } from '@renderer/composables/useAppearance'

const panel = ref<HTMLElement | null>(null)
const modes: Array<{ value: Appearance['mode'], label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]
const swatches = [
  { color: '#638575', label: '鼠尾草绿' },
  { color: '#6287b5', label: '雾霭蓝' },
  { color: '#9181b3', label: '柔和紫' },
  { color: '#b68086', label: '玫瑰粉' },
  { color: '#b39260', label: '琥珀金' },
  { color: '#737e83', label: '石墨灰' },
]
let previousFocus: HTMLElement | null = null
const close = () => { appearancePanelOpen.value = false }
function handleAccentInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (/^#[\da-f]{6}$/i.test(value)) appearance.accent = value.toLowerCase()
}
function handleRadiusInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(value)) appearance.radius = Math.max(8, Math.min(28, value))
}
function handlePanelGapInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(value)) appearance.panelGap = Math.max(4, Math.min(32, Math.round(value)))
}
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = panel.value?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')
  if (!focusable?.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
watch(appearancePanelOpen, async open => {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    panel.value?.focus()
  } else {
    previousFocus?.focus()
    previousFocus = null
  }
})
onBeforeUnmount(() => { previousFocus?.focus() })
</script>

<style lang="less">
.appearance-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 24px;
  box-sizing: border-box;
  background: var(--modern-overlay);
  backdrop-filter: blur(5px);
  -webkit-app-region: no-drag;
}
.appearance-panel {
  width: 360px;
  max-width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--modern-border);
  border-radius: var(--modern-radius);
  outline: none;
  color: var(--modern-text);
  background: var(--modern-panel);
  box-shadow: 0 20px 90px rgba(0, 0, 0, .17);
  overflow: hidden;
  font-size: 13px;
  line-height: 1.5;
}
.appearance-header {
  display: flex;
  justify-content: space-between;
  padding: 24px 24px 20px;
  flex: none;
  border-bottom: 1px solid var(--modern-border);
  h2 { margin: 7px 0 5px; font-size: 19px; font-weight: 600; letter-spacing: -.5px; }
  p { color: var(--modern-muted); font-size: 12px; }
}
.appearance-eyebrow { font-size: 9px; font-weight: 600; letter-spacing: 2px; color: var(--modern-accent-ink); }
.appearance-close {
  border: 0;
  background: var(--modern-hover);
  color: var(--modern-muted);
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  cursor: pointer;
  svg { width: 15px; height: 15px; }
  &:hover { color: var(--modern-text); }
}
.appearance-body { padding: 22px 24px; overflow-y: auto; min-height: 0; }
.appearance-section { margin: 0 0 23px; padding: 0; border: 0; min-width: 0; }
.appearance-section legend, .appearance-label { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-bottom: 13px; font-weight: 500; font-size: 12px; }
.appearance-value { color: var(--modern-muted); font-size: 10px; font-weight: 400; font-variant-numeric: tabular-nums; }
.appearance-modes { display: flex; gap: 9px; }
.appearance-mode {
  position: relative;
  flex: 1;
  min-width: 0;
  padding: 8px 8px 9px;
  background: transparent;
  border: 1px solid var(--modern-border);
  border-radius: 10px;
  color: var(--modern-muted);
  cursor: pointer;
  font-size: 11px;
  &.selected { border-color: var(--modern-accent); background: var(--modern-accent-soft); color: var(--modern-text); }
}
.appearance-mode-preview {
  height: 43px;
  display: flex;
  position: relative;
  background: #f6f7f6;
  border: 1px solid rgba(0, 0, 0, .08);
  border-radius: 5px;
  margin-bottom: 8px;
  overflow: hidden;
  i:first-child { width: 22%; height: 100%; background: #e5e9e6; }
  i:nth-child(2) { position: absolute; left: 32%; right: 11%; top: 10px; height: 4px; border-radius: 5px; background: #c1cac4; }
  i:last-child { position: absolute; left: 32%; right: 27%; top: 19px; height: 4px; border-radius: 5px; background: #d4dad6; }
  &.dark { background: #242727; i:first-child { background: #171b19; } i:nth-child(2) { background: #65706a; } i:last-child { background: #424b46; } }
  &.system { background: linear-gradient(90deg, #f6f7f6 50%, #242727 50%); i:last-child { background: linear-gradient(90deg, #d4dad6 40%, #65706a 40%); } }
}
.appearance-mode-check { width: 12px; height: 12px; position: absolute; right: 5px; bottom: 11px; color: var(--modern-accent-ink); }
.appearance-colors { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.appearance-swatch {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: var(--swatch);
  color: white;
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
  svg { width: 17px; height: 17px; }
  &.selected { outline: 1px solid var(--swatch); outline-offset: 3px; }
}
.appearance-custom-color {
  position: relative;
  width: 29px;
  height: 29px;
  border: 1px dashed var(--modern-muted);
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--modern-muted);
  cursor: pointer;
  input { position: absolute; width: 100%; height: 100%; inset: 0; opacity: 0; cursor: pointer; }
  svg { width: 15px; height: 15px; pointer-events: none; }
  &:focus-within { outline: 2px solid var(--modern-accent); outline-offset: 3px; }
}
.appearance-range { width: 100%; margin: 0; height: 18px; cursor: pointer; accent-color: var(--modern-accent); }
.appearance-range-labels { display: flex; justify-content: space-between; margin-top: 4px; color: var(--modern-muted); font-size: 10px; }
.appearance-density {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--modern-hover);
  border-radius: 10px;
  button { flex: 1; border: 0; padding: 7px; border-radius: 7px; color: var(--modern-muted); background: transparent; cursor: pointer; font-size: 12px; }
  button.selected { color: var(--modern-text); background: var(--modern-panel); box-shadow: 0 1px 4px rgba(0, 0, 0, .05); }
}
.appearance-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  label { font-size: 12px; font-weight: 500; }
  p { margin-top: 4px; font-size: 10px; color: var(--modern-muted); }
}
.appearance-toggle {
  display: flex;
  align-items: center;
  width: 34px;
  height: 20px;
  border: 0;
  border-radius: 20px;
  background: var(--modern-muted);
  padding: 3px;
  cursor: pointer;
  transition: background .2s;
  span { width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .2s; box-shadow: 0 1px 3px rgba(0, 0, 0, .1); }
  &[aria-checked='true'] { background: var(--modern-accent); span { transform: translateX(14px); } }
}
.appearance-live-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--modern-border);
  border-radius: var(--modern-radius-small);
  background: var(--modern-bg);
  strong { display: block; font-size: 11px; font-weight: 500; }
  span { display: block; font-size: 9px; color: var(--modern-muted); margin-top: 3px; }
}
.appearance-preview-art { width: 36px; height: 36px; display: grid; place-items: center; flex: none; border-radius: 9px; background: var(--modern-accent-soft); color: var(--modern-accent-ink); svg { width: 18px; height: 18px; } }
.appearance-live-preview .appearance-preview-play { display: grid; place-items: center; width: 27px; height: 27px; margin: 0 0 0 auto; border-radius: 50%; color: var(--modern-panel); background: var(--modern-text); svg { width: 16px; height: 16px; } }
.appearance-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 24px;
  border-top: 1px solid var(--modern-border);
  flex: none;
  button { font-size: 12px; padding: 8px 15px; border: 0; border-radius: 9px; cursor: pointer; }
}
.appearance-reset { background: transparent; color: var(--modern-muted); &:hover { color: var(--modern-text); } }
.appearance-done { background: var(--modern-text); color: var(--modern-panel); }
.appearance-panel button:focus-visible { outline: 2px solid var(--modern-accent); outline-offset: 3px; }
.appearance-float-enter-active, .appearance-float-leave-active { transition: opacity .2s; .appearance-panel { transition: transform .25s ease; } }
.appearance-float-enter-from, .appearance-float-leave-to { opacity: 0; .appearance-panel { transform: translateX(20px); } }
@media (max-width: 760px) { .appearance-overlay { padding: 12px; justify-content: center; } }
@media (prefers-reduced-motion: reduce) { .appearance-float-enter-active, .appearance-float-leave-active, .appearance-toggle span { transition: none; } }
</style>


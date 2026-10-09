import { computed, reactive, ref, watch } from 'vue'

export interface Appearance {
  mode: 'light' | 'dark' | 'system'
  accent: string
  radius: number
  density: 'comfortable' | 'compact'
  showExplore: boolean
}

const STORAGE_KEY = 'lx-modern-appearance-v1'
const defaults: Appearance = {
  mode: 'light',
  accent: '#638575',
  radius: 20,
  density: 'comfortable',
  showExplore: true,
}

/** Keep old or malformed saved preferences from breaking the renderer. */
export function validateAppearance(value: unknown): Appearance {
  const input = value && typeof value === 'object' ? value as Partial<Appearance> : {}
  return {
    mode: input.mode === 'dark' || input.mode === 'system' ? input.mode : 'light',
    accent: typeof input.accent === 'string' && /^#[\da-f]{6}$/i.test(input.accent) ? input.accent.toLowerCase() : defaults.accent,
    radius: typeof input.radius === 'number' && Number.isFinite(input.radius) ? Math.min(28, Math.max(8, Math.round(input.radius))) : defaults.radius,
    density: input.density === 'compact' ? 'compact' : 'comfortable',
    showExplore: typeof input.showExplore === 'boolean' ? input.showExplore : defaults.showExplore,
  }
}

function readAppearance(): Appearance {
  try {
    return validateAppearance(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return { ...defaults }
  }
}

export const appearance = reactive<Appearance>(readAppearance())
export const appearancePanelOpen = ref(false)
const systemDark = ref(false)
export const resolvedAppearanceMode = computed(() => appearance.mode === 'system' ? (systemDark.value ? 'dark' : 'light') : appearance.mode)

type RGB = [number, number, number]
const rgb = (hex: string): RGB => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)) as RGB
const mix = (first: RGB, second: RGB, amount: number): RGB => first.map((channel, index) => Math.round(channel + (second[index] - channel) * amount)) as RGB
const color = (value: RGB) => `rgb(${value.join(', ')})`
const alpha = (value: RGB, opacity: number) => `rgba(${value.join(', ')}, ${opacity})`
const luminance = (value: RGB) => value.map(channel => {
  const normalized = channel / 255
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
}).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0)
const contrast = (first: RGB, second: RGB) => (Math.max(luminance(first), luminance(second)) + 0.05) / (Math.min(luminance(first), luminance(second)) + 0.05)

function readableAccent(accent: RGB, panel: RGB, text: RGB): RGB {
  let value = accent
  for (let step = 0; contrast(value, panel) < 4.5 && step < 10; step++) value = mix(value, text, 0.18)
  return value
}

function applyAppearance() {
  const root = document.documentElement
  const dark = resolvedAppearanceMode.value === 'dark'
  const bg = rgb(dark ? '#181a1a' : '#f7f8f7')
  const panel = rgb(dark ? '#222525' : '#ffffff')
  const sidebar = rgb(dark ? '#1d2020' : '#f0f2f0')
  const text = rgb(dark ? '#eceeed' : '#252b28')
  const muted = rgb(dark ? '#a1aaa6' : '#78817c')
  const accent = rgb(appearance.accent)
  const ink = readableAccent(accent, panel, text)
  const soft = mix(panel, accent, dark ? 0.17 : 0.1)
  const hover = mix(panel, text, dark ? 0.06 : 0.04)
  const border = alpha(text, dark ? 0.1 : 0.08)
  const tokens: Record<string, string> = {
    '--modern-bg': color(bg),
    '--modern-panel': color(panel),
    '--modern-sidebar': color(sidebar),
    '--modern-hero-bg': dark ? '#29312c' : '#e9efea',
    '--modern-text': color(text),
    '--modern-muted': color(muted),
    '--modern-border': border,
    '--modern-accent': color(accent),
    '--modern-accent-ink': color(ink),
    '--modern-accent-contrast': contrast(accent, [255, 255, 255]) >= contrast(accent, [20, 25, 23]) ? '#ffffff' : '#141917',
    '--modern-accent-soft': color(soft),
    '--modern-hover': color(hover),
    '--modern-radius': `${appearance.radius}px`,
    '--modern-radius-small': `${Math.round(appearance.radius * 0.6)}px`,
    '--modern-shadow': dark ? '0 8px 32px rgba(0, 0, 0, 0.18)' : '0 4px 24px rgba(28, 42, 34, 0.04)',
    '--modern-row-height': appearance.density === 'compact' ? '36px' : '46px',
    '--modern-gap': appearance.density === 'compact' ? '10px' : '16px',
    '--modern-overlay': dark ? 'rgba(0, 0, 0, 0.46)' : 'rgba(34, 42, 38, 0.18)',
    '--color-app-background': color(bg),
    '--color-main-background': color(panel),
    '--color-content-background': color(panel),
    '--color-nav-font': color(text),
    '--color-font': color(text),
    '--color-font-label': color(muted),
    '--color-label': color(muted),
    '--color-primary': color(ink),
    '--color-primary-theme': color(accent),
    '--color-primary-font': color(ink),
    '--color-primary-font-hover': color(mix(ink, text, 0.18)),
    '--color-primary-font-active': color(text),
    '--color-primary-background': color(soft),
    '--color-primary-background-hover': color(hover),
    '--color-primary-background-active': color(mix(panel, accent, 0.19)),
    '--color-button-font': color(text),
    '--color-button-font-selected': color(ink),
    '--color-button-background': color(soft),
    '--color-button-background-selected': color(mix(panel, accent, 0.19)),
    '--color-button-background-hover': color(mix(panel, accent, 0.15)),
    '--color-button-background-active': color(mix(panel, accent, 0.23)),
    '--color-list-header-border-bottom': `1px solid ${border}`,
    '--color-badge-primary': color(ink),
    '--background-image': 'none',
  }

  // Original components use hundreds of generated theme shades. Recreate them
  // against the current surface so dialogs and existing pages share both modes.
  for (let step = 0; step <= 1000; step += 50) {
    tokens[`--color-${String(step).padStart(3, '0')}`] = color(mix(panel, text, step / 1000))
  }
  for (let step = 100; step <= 900; step += 100) {
    tokens[`--color-primary-alpha-${step}`] = alpha(ink, 1 - step / 1000)
  }
  for (const shade of ['light', 'dark'] as const) {
    for (let step = 100; step <= 1000; step += 100) {
      const value = shade === 'light' ? mix(accent, panel, step / 1050) : mix(ink, text, step / 1500)
      const name = `--color-primary-${shade}-${step}`
      tokens[name] = color(value)
      for (let opacity = 100; opacity <= 900; opacity += 100) tokens[`${name}-alpha-${opacity}`] = alpha(value, 1 - opacity / 1000)
    }
  }
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value)
  root.dataset.modernTheme = resolvedAppearanceMode.value
  root.dataset.modernDensity = appearance.density
  root.style.colorScheme = resolvedAppearanceMode.value
}

export function resetAppearance() {
  Object.assign(appearance, defaults)
}

let initialized = false
export function useAppearance() {
  if (!initialized && typeof document !== 'undefined') {
    initialized = true
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    systemDark.value = media.matches
    media.addEventListener('change', event => { systemDark.value = event.matches })
    watch([appearance, systemDark], () => {
      applyAppearance()
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance))
      } catch {
        // The live controls also work when storage is unavailable.
      }
    }, { deep: true, immediate: true })
    window.addEventListener('storage', event => {
      if (event.key === STORAGE_KEY) {
        try {
          Object.assign(appearance, validateAppearance(JSON.parse(event.newValue ?? 'null')))
        } catch {
          resetAppearance()
        }
      }
    })
  }
  return { appearance, appearancePanelOpen, resolvedAppearanceMode, resetAppearance }
}

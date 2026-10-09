import { onBeforeUnmount, onMounted, ref } from 'vue'
import { allHotKeys, getHotKeyConfig, hotKeyGetStatus, hotKeySetConfig, hotKeySetEnable } from '@renderer/utils/ipc'

type Kind = 'local' | 'global'
export function useHotkeys(report: (error: unknown) => void) {
  const config = ref<LX.HotKeyConfigAll>({ local: { enable: false, keys: {} }, global: { enable: false, keys: {} } })
  const status = ref<LX.HotKeyState>(new Map())
  const recording = ref<{ kind: Kind, info: LX.HotKey, next: string, changed: boolean } | null>(null)
  const formatted = (key: string) => key.replace(/mod/g, 'Ctrl').replace(/arrowleft/g, '←').replace(/arrowright/g, '→').replace(/arrowup/g, '↑').replace(/arrowdown/g, '↓').split('+').map(part => part.length === 1 ? part.toUpperCase() : part).join(' + ')
  const binding = (kind: Kind, name: string) => Object.entries(config.value[kind].keys).find(([, info]) => info.name === name)?.[0] ?? ''
  // Electron cannot clone Vue proxies, including nested key metadata.
  const plainConfig = (value: LX.HotKeyConfigAll): LX.HotKeyConfigAll => JSON.parse(JSON.stringify(value))
  async function refresh() { config.value = await getHotKeyConfig(); status.value = await hotKeyGetStatus() }
  function begin(kind: Kind, info: LX.HotKey) {
    recording.value = { kind, info, next: binding(kind, info.name), changed: false }
    window.lx.isEditingHotKey = true
    void hotKeySetEnable(false).catch(report)
  }
  async function finish() {
    const item = recording.value
    recording.value = null
    if (!item) return
    try {
      if (item.changed) {
        const next: LX.HotKeyConfigAll = {
          local: { enable: config.value.local.enable, keys: Object.fromEntries(Object.entries(config.value.local.keys).filter(([key, info]) => key !== item.next && !(item.kind === 'local' && info.name === item.info.name))) },
          global: { enable: config.value.global.enable, keys: Object.fromEntries(Object.entries(config.value.global.keys).filter(([key, info]) => key !== item.next && !(item.kind === 'global' && info.name === item.info.name))) },
        }
        if (item.next) next[item.kind].keys[item.next] = { name: item.info.name, action: item.info.action, type: item.info.type }
        await hotKeySetConfig({ action: 'config', data: plainConfig(next) })
        config.value = next
      }
    } catch (error) { report(error) } finally {
      window.lx.isEditingHotKey = false
      await hotKeySetEnable(true).catch(report)
      status.value = await hotKeyGetStatus().catch(() => new Map())
    }
  }
  const handleKey = ({ event, key, type }: LX.KeyDownEevent) => {
    if (!recording.value || type !== 'down' || !event || event.repeat || ['tab', 'mod', 'alt', 'shift', 'control', 'meta'].includes(key)) return
    event.preventDefault()
    recording.value.next = key === 'delete' || key === 'backspace' ? '' : key
    recording.value.changed = true
  }
  async function enable(kind: Kind, value: boolean) {
    try {
      const next = plainConfig(config.value)
      next[kind].enable = value
      if (kind === 'global') await hotKeySetConfig({ action: 'enable', data: value })
      await hotKeySetConfig({ action: 'config', data: next })
      config.value = next
      status.value = await hotKeyGetStatus()
    } catch (error) { report(error) }
  }
  onMounted(() => { void refresh().catch(report); window.app_event.on('keyDown', handleKey) })
  onBeforeUnmount(() => { window.app_event.off('keyDown', handleKey); if (recording.value) { window.lx.isEditingHotKey = false; void hotKeySetEnable(true).catch(report) } })
  return { config, status, recording, allHotKeys, formatted, binding, begin, finish, enable, refresh }
}

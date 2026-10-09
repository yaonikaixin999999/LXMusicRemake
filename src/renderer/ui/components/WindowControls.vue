<template>
  <div class="ui-window-controls" :class="{ 'ui-window-left': appSetting['common.controlBtnPosition'] === 'left' }">
    <button type="button" aria-label="最小化" title="最小化" @click="minWindow"><UiIcon name="minimize" /></button>
    <button type="button" :aria-label="maximizeLabel" :title="maximizeLabel" :disabled="changing" @click="toggle"><UiIcon :name="state.isMaximized || state.isFullscreen ? 'restore' : 'maximize'" /></button>
    <button type="button" class="ui-close-window" aria-label="关闭窗口" title="关闭窗口" @click="closeWindow"><UiIcon name="close" /></button>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ipcRenderer } from 'electron'
import { isFullscreen } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'
import { minWindow, closeWindow } from '@renderer/utils/ipc'
import UiIcon from './UiIcon.vue'

interface WindowState { isMaximized: boolean, isFullscreen: boolean }
const state = ref<WindowState>({ isMaximized: false, isFullscreen: false })
const changing = ref(false)
const maximizeLabel = computed(() => state.value.isFullscreen ? '退出全屏' : state.value.isMaximized ? '还原窗口' : '最大化')
const apply = (value: WindowState) => {
  state.value = value
  isFullscreen.value = value.isFullscreen
  document.documentElement.classList.toggle('maximized', value.isMaximized)
}
const onState = (_event: Electron.IpcRendererEvent, value: WindowState) => { apply(value) }
async function toggle() {
  if (changing.value) return
  changing.value = true
  try { apply(await ipcRenderer.invoke('winMain_toggle_maximize')) } finally { changing.value = false }
}
onMounted(() => {
  ipcRenderer.on('winMain_window_state', onState)
  void ipcRenderer.invoke('winMain_get_window_state').then(apply)
})
onBeforeUnmount(() => { ipcRenderer.removeListener('winMain_window_state', onState) })
</script>

<template>
  <UiModal :show="show" title="关闭 LinkLine 窗口？" width="500px" @close="answer('cancel')">
    <p class="linkline-close-note">最小化到托盘后，音乐会继续播放；退出应用会停止播放。</p>
    <label class="linkline-close-remember"><input v-model="remember" type="checkbox" :disabled="busy">不再询问</label>
    <p class="linkline-close-hint">可随时在「设置 → 常规与外观」修改关闭窗口的行为。</p>
    <p v-if="error" class="ui-dialog-error" role="alert">{{ error }}</p>
    <template #footer>
      <button type="button" class="ui-dialog-button" :disabled="busy" @click="answer('cancel')">取消</button>
      <button type="button" class="ui-dialog-button ui-dialog-button-danger" :disabled="busy" @click="answer('quit')">退出应用</button>
      <button type="button" class="ui-dialog-button linkline-close-tray" :disabled="busy" autofocus @click="answer('tray')">最小化到托盘</button>
    </template>
  </UiModal>
</template>

<script setup lang="ts">
import { ipcRenderer } from 'electron'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { WINDOW_CLOSE_EVENT_NAME, type WindowCloseResponse } from '@common/windowClose'
import UiModal from './UiModal.vue'

const show = ref(false)
const remember = ref(false)
const busy = ref(false)
const error = ref('')
function open() {
  if (show.value) return
  remember.value = false
  error.value = ''
  show.value = true
}
async function answer(action: WindowCloseResponse['action']) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await ipcRenderer.invoke(WINDOW_CLOSE_EVENT_NAME.respond, { action, remember: action !== 'cancel' && remember.value } satisfies WindowCloseResponse)
    show.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : '无法完成关闭操作，请重试。'
  } finally { busy.value = false }
}
onMounted(() => {
  ipcRenderer.on(WINDOW_CLOSE_EVENT_NAME.requested, open)
  void ipcRenderer.invoke(WINDOW_CLOSE_EVENT_NAME.ready).then(pending => { if (pending) open() }).catch(() => {})
})
onBeforeUnmount(() => { ipcRenderer.removeListener(WINDOW_CLOSE_EVENT_NAME.requested, open) })
</script>

<style lang="less">
.ui-dialog-backdrop:has(.linkline-close-note) { z-index: 1400; }
.linkline-close-note { color: var(--modern-muted); line-height: 1.8; font-size: 14px; }
.linkline-close-remember { display: flex; align-items: center; gap: 10px; margin-top: 24px; cursor: pointer; input { width: 16px; height: 16px; margin: 0; accent-color: var(--modern-accent); } }
.linkline-close-hint { margin-top: 12px; color: var(--modern-muted); font-size: 11px; line-height: 1.7; }
.linkline-close-tray { background: var(--modern-accent); border-color: transparent; color: var(--modern-accent-contrast, #fff); &:hover { background: var(--modern-accent); opacity: .86; } }
</style>

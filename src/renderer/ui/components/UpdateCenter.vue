<template>
  <UiModal :show="updateCenterOpen" title="更新中心" subtitle="LinkLine · 新版本与更新日志" width="680px" @close="updateCenterOpen = false"><UpdateCenterPanel /><template #footer><button type="button" class="ui-dialog-button ui-dialog-button-primary" @click="updateCenterOpen = false">完成</button></template></UiModal>
</template>

<script setup lang="ts">
import UiModal from './UiModal.vue'
import UpdateCenterPanel from './UpdateCenterPanel.vue'
import { updateCenterOpen } from '@renderer/ui/services/appUpdate'
</script>

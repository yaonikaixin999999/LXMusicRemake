<template><UiModal :show="visible" title="提示" @close="handleCancel"><p class="ui-message-content" :class="{ select: selection }">{{ message }}</p><template #footer><button v-if="showCancel" type="button" class="ui-dialog-button" @click="handleCancel">{{ cancelButtonText || '取消' }}</button><button type="button" class="ui-dialog-button ui-dialog-button-primary" @click="handleComfirm">{{ confirmButtonText || '确定' }}</button></template></UiModal></template>
<script>
import UiModal from '@renderer/ui/components/UiModal.vue'
export default {
  components: { UiModal },
  props: { afterLeave: { type: Function, default: () => {} } },
  data() { return { visible: false, message: '', showCancel: false, cancelButtonText: '', confirmButtonText: '', teleport: '#root', selection: false } },
  watch: { visible(value) { if (!value) setTimeout(() => { this.afterLeave() }, 220) } },
  methods: { handleCancel() {}, handleComfirm() {} },
}
</script>
<style lang="less">.ui-message-content { white-space: pre-line; line-height: 1.8; font-size: 12px; }</style>

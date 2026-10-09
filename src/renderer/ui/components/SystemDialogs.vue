<template>
  <UiModal :show="!appSetting['common.isAgreePact'] || isShowPact" title="欢迎来到 LX Studio" subtitle="全新的音乐空间，基于 LX Music 的音乐服务构建。" width="680px" @close="closePact"><div class="ui-license-content"><p v-for="(paragraph, index) in licenseContent" :key="index">{{ paragraph }}</p></div><template #footer><button v-if="!appSetting['common.isAgreePact']" type="button" class="ui-dialog-button" @click="quitApp(true)">退出</button><button type="button" class="ui-dialog-button ui-dialog-button-primary" @click="agree">{{ appSetting['common.isAgreePact'] ? '关闭' : '接受并开始使用' }}</button></template></UiModal>
  <UiModal :show="sync.isShowAuthCodeModal" title="连接音乐同步服务" subtitle="输入同步服务器显示的连接码。" @close="sync.isShowAuthCodeModal = false"><form @submit.prevent="authorize"><label class="ui-dialog-field"><span>连接码</span><input v-model="authCode" maxlength="100" aria-label="同步连接码"></label><p v-if="error" class="ui-dialog-error">{{ error }}</p><button type="submit" class="ui-dialog-button ui-dialog-button-primary" :disabled="!authCode.trim()">连接</button></form></UiModal>
  <UiModal :show="sync.isShowSyncMode" title="选择同步方式" :subtitle="`与 ${sync.deviceName} 同步${sync.type === 'list' ? '歌单' : '屏蔽列表'}`" @close="selectMode('cancel')"><div class="ui-sync-options"><button v-for="mode in modes" :key="mode.id" type="button" class="ui-button" @click="selectMode(mode.id)"><strong>{{ mode.name }}</strong><small>{{ mode.description }}</small></button></div><label v-if="sync.type === 'list'" class="ui-dialog-note"><input v-model="fullOverwrite" type="checkbox">覆盖模式同时移除目标端多余歌单</label></UiModal>
</template>
<script setup>
import { ref } from 'vue'
import { sync, isShowPact } from '@renderer/store'
import { appSetting, saveAgreePact } from '@renderer/store/setting'
import { sendSyncAction, quitApp } from '@renderer/utils/ipc'
import UiModal from './UiModal.vue'
import licenseContent from '../../../common-license.json'
const authCode = ref(''); const error = ref(''); const fullOverwrite = ref(false)
const closePact = () => { if (appSetting['common.isAgreePact']) isShowPact.value = false }
const agree = () => { saveAgreePact(true); isShowPact.value = false }
const modes = [{ id: 'merge_local_remote', name: '合并，优先保留本机排序', description: '整合两端音乐，保留所有歌曲。' }, { id: 'merge_remote_local', name: '合并，优先保留远端排序', description: '整合两端音乐，以远端排序为主。' }, { id: 'overwrite_local_remote', name: '用本机覆盖远端', description: '远端对应内容将被本机内容替换。' }, { id: 'overwrite_remote_local', name: '用远端覆盖本机', description: '本机对应内容将被远端内容替换。' }]
const authorize = async() => { try { await sendSyncAction({ action: 'enable_client', data: { enable: appSetting['sync.enable'], host: appSetting['sync.client.host'], authCode: authCode.value.trim() } }); sync.isShowAuthCodeModal = false; authCode.value = '' } catch (err) { error.value = err.message } }
const selectMode = mode => { if (mode.startsWith('overwrite') && fullOverwrite.value && sync.type === 'list') mode += '_full'; void sendSyncAction({ action: 'select_mode', data: { type: sync.type, mode } }); sync.isShowSyncMode = false }
</script>
<style lang="less">.ui-license-content { font-size: 11px; line-height: 1.9; max-height: 48vh; overflow: auto; user-select: text; p { margin-bottom: 10px; } } .ui-sync-options { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; .ui-button { flex-direction: column; align-items: flex-start; padding: 15px; small { color: var(--modern-muted); font-size: 10px; } } }</style>


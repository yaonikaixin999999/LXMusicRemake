<template>
  <CloseWindowDialog />
  <UiModal :show="!appSetting['common.isAgreePact'] || isShowPact" title="欢迎来到 LinkLine" subtitle="使用说明与协议" width="600px" @close="closePact"><div class="ui-license-content"><p v-for="(paragraph, index) in licenseContent" :key="index">{{ paragraph }}</p></div><p v-if="agreementError" class="ui-dialog-error" role="alert">{{ agreementError }}</p><template #footer><button v-if="!appSetting['common.isAgreePact']" type="button" class="ui-dialog-button" @click="quitApp(true)">退出</button><button type="button" class="ui-dialog-button ui-dialog-button-primary" :disabled="agreementBusy" @click="agree">{{ agreementBusy ? '正在保存…' : appSetting['common.isAgreePact'] ? '关闭' : '接受并开始使用' }}</button></template></UiModal>
  <UiModal :show="showLoginPrompt" title="连接音乐平台" subtitle="QQ 音乐与网易云音乐" width="460px" @close="showLoginPrompt = false"><p class="ui-dialog-note">登录由对应音乐平台完成，可使用扫码或平台支持的账号登录方式。LinkLine 会将平台红心同步到「我喜欢的音乐」，你点击收藏时会同步到已登录且有版权的平台。</p><p class="ui-dialog-note ui-login-prompt-note">也可以稍后在设置的「平台账号与红心」中连接。</p><template #footer><button type="button" class="ui-dialog-button" @click="showLoginPrompt = false">稍后</button><button type="button" class="ui-dialog-button ui-dialog-button-primary" @click="openPlatformSettings">前往登录</button></template></UiModal>
  <UiModal :show="sync.isShowAuthCodeModal" title="连接音乐同步服务" subtitle="输入同步服务器显示的连接码。" @close="sync.isShowAuthCodeModal = false"><form @submit.prevent="authorize"><label class="ui-dialog-field"><span>连接码</span><input v-model="authCode" maxlength="100" aria-label="同步连接码"></label><p v-if="error" class="ui-dialog-error">{{ error }}</p><button type="submit" class="ui-dialog-button ui-dialog-button-primary" :disabled="!authCode.trim()">连接</button></form></UiModal>
  <UiModal :show="sync.isShowSyncMode" title="选择同步方式" :subtitle="`与 ${sync.deviceName} 同步${sync.type === 'list' ? '歌单' : '屏蔽列表'}`" @close="selectMode('cancel')"><div class="ui-sync-options"><button v-for="mode in modes" :key="mode.id" type="button" class="ui-button" @click="selectMode(mode.id)"><strong>{{ mode.name }}</strong><small>{{ mode.description }}</small></button></div><label v-if="sync.type === 'list'" class="ui-dialog-note"><input v-model="fullOverwrite" type="checkbox">覆盖模式同时移除目标端多余歌单</label></UiModal>
</template>
<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { sync, isShowPact } from '@renderer/store'
import { appSetting, mergeSetting } from '@renderer/store/setting'
import { sendSyncAction, quitApp, updateSetting } from '@renderer/utils/ipc'
import UiModal from './UiModal.vue'
import CloseWindowDialog from './CloseWindowDialog.vue'
const licenseContent = [
  'LinkLine 是一款独立音乐客户端，基于 LX Music 构建。',
  '音乐平台提供的歌曲、封面、歌词及其他内容归其权利人所有。播放和下载取决于平台权限及可用音源，请尊重版权并遵守相关平台的使用规则。',
  '第三方账号登录在相应音乐平台的页面完成。LinkLine 不收集或保存账号密码，登录状态保存在本机，可在平台账号设置中退出。',
  '登录后，平台红心歌曲会汇总到本地音乐库。你主动点击收藏或取消收藏时，LinkLine 会向已登录的平台提交操作；无版权、版本无法确认或同步失败时会显示对应结果。',
  '本地音乐库和应用设置保存在你的设备上。请仅导入有权使用的音乐、脚本及备份，并自行保管需要保留的数据。',
  '接受本协议后即可开始使用 LinkLine。开源版权、许可证和项目归属可在设置的「关于」中查看。',
]
const router = useRouter()
const agreementBusy = ref(false)
const agreementError = ref('')
const showLoginPrompt = ref(false)
const loginPromptKey = 'linkline.platform-login-prompt.v1'
let loginPromptSeen = false
try { loginPromptSeen = localStorage.getItem(loginPromptKey) === 'shown' } catch {}
const authCode = ref(''); const error = ref(''); const fullOverwrite = ref(false)
const closePact = () => { if (appSetting['common.isAgreePact']) isShowPact.value = false }
const agree = async() => {
  if (appSetting['common.isAgreePact']) { isShowPact.value = false; return }
  if (agreementBusy.value) return
  agreementBusy.value = true
  agreementError.value = ''
  try {
    await updateSetting({ 'common.isAgreePact': true })
    mergeSetting({ 'common.isAgreePact': true })
    isShowPact.value = false
  } catch (err) { agreementError.value = err instanceof Error ? err.message : '无法保存协议状态，请重试。' } finally { agreementBusy.value = false }
}
watch([() => appSetting['common.isAgreePact'], isShowPact], ([agreed, reviewing]) => {
  if (!agreed || reviewing || loginPromptSeen) return
  loginPromptSeen = true
  try { localStorage.setItem(loginPromptKey, 'shown') } catch {}
  showLoginPrompt.value = true
}, { immediate: true })
const openPlatformSettings = () => { showLoginPrompt.value = false; void router.push({ path: '/setting', query: { category: 'accounts' } }) }
const modes = [{ id: 'merge_local_remote', name: '合并，优先保留本机排序', description: '整合两端音乐，保留所有歌曲。' }, { id: 'merge_remote_local', name: '合并，优先保留远端排序', description: '整合两端音乐，以远端排序为主。' }, { id: 'overwrite_local_remote', name: '用本机覆盖远端', description: '远端对应内容将被本机内容替换。' }, { id: 'overwrite_remote_local', name: '用远端覆盖本机', description: '本机对应内容将被远端内容替换。' }]
const authorize = async() => { try { await sendSyncAction({ action: 'enable_client', data: { enable: appSetting['sync.enable'], host: appSetting['sync.client.host'], authCode: authCode.value.trim() } }); sync.isShowAuthCodeModal = false; authCode.value = '' } catch (err) { error.value = err.message } }
const selectMode = mode => { if (mode.startsWith('overwrite') && fullOverwrite.value && sync.type === 'list') mode += '_full'; void sendSyncAction({ action: 'select_mode', data: { type: sync.type, mode } }); sync.isShowSyncMode = false }
</script>
<style lang="less">.ui-license-content { font-size: 11px; line-height: 1.9; max-height: 48vh; overflow: auto; user-select: text; p { margin-bottom: 10px; } } .ui-login-prompt-note { margin-top: 14px; } .ui-sync-options { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; .ui-button { flex-direction: column; align-items: flex-start; padding: 15px; small { color: var(--modern-muted); font-size: 10px; } } }</style>


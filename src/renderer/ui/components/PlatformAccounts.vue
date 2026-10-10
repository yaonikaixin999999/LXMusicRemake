<template>
  <div class="ui-platform-accounts">
    <div class="ui-platform-toolbar"><router-link to="/list?id=love"><UiIcon name="heart" /><span>红心音乐 <strong>{{ platformSnapshot.favorites.length }}</strong></span><UiIcon name="chevronRight" /></router-link><button type="button" class="studio-settings-button" :disabled="platformLoading || platformBusy.size > 0 || !syncableAccounts.length" @click="syncPlatforms()"><UiIcon name="refresh" />同步全部</button></div>
    <p v-if="platformLoading" class="ui-platform-status" role="status">正在检查账号…</p>
    <div v-if="platformError" class="ui-platform-error" role="alert">{{ platformError }}</div>
    <article v-for="account in accounts" :key="account.platform" class="ui-platform-account">
      <div class="ui-platform-avatar" :class="account.platform"><img v-if="account.profile?.avatar" :src="account.profile.avatar" alt="" referrerpolicy="no-referrer" @error="hideAvatar"><UiIcon v-else name="music" /></div>
      <div class="ui-platform-info"><h3>{{ account.name }}<span :class="{ connected: account.connected }">{{ account.connected ? '已连接' : account.profile ? '登录已过期' : '未连接' }}</span></h3><p>{{ account.profile?.nickname || '尚未登录' }}</p><small v-if="account.lastSync">{{ account.count }} 首红心 · {{ playlistCount(account.platform) }} 份歌单 · {{ formatTime(account.lastSync) }}{{ account.connected ? '' : ' · 离线记录' }}</small><small v-else-if="account.connected">尚未同步音乐库</small><p v-if="account.notice" class="ui-platform-account-notice">{{ account.notice }}</p><p v-if="account.error" class="ui-platform-account-error" role="status">{{ account.error }}</p></div>
      <div class="ui-platform-actions"><button v-if="account.connected" type="button" class="studio-settings-button" :disabled="account.canSync === false || platformBusy.has(account.platform)" @click="syncPlatforms(account.platform)"><UiIcon name="refresh" />{{ platformBusy.has(account.platform) ? '处理中…' : account.canSync === false ? '不支持云同步' : '同步音乐库' }}</button><button v-else type="button" class="studio-settings-button primary" :disabled="platformLoading || platformBusy.has(account.platform)" @click="loginPlatform(account.platform)"><UiIcon name="arrowUpRight" />{{ platformBusy.has(account.platform) ? '正在打开…' : account.canSync === false ? '打开官网登录' : account.profile ? '重新登录' : '登录' }}</button><button v-if="account.profile" type="button" class="studio-settings-button" :disabled="platformBusy.has(account.platform)" @click="confirmLogout(account)">退出</button></div>
    </article>
    <UiModal :show="Boolean(logoutAccount)" title="退出平台账号" @close="logoutAccount = null"><p class="ui-dialog-note">退出 {{ logoutAccount?.name }} 后，此平台的同步红心将从聚合列表移除。你主动保存的本地收藏会继续保留。</p><template #footer><button type="button" class="ui-dialog-button" @click="logoutAccount = null">取消</button><button type="button" class="ui-dialog-button ui-dialog-button-primary" @click="logout">退出账号</button></template></UiModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PlatformAccount } from '@common/platformAccounts'
import { connectedPlatforms, loginPlatform, logoutPlatform, platformBusy, platformError, platformLoading, platformSnapshot, syncPlatforms } from '../services/platformAccounts'
import UiIcon from './UiIcon.vue'
import UiModal from './UiModal.vue'

const platformNames: Record<PlatformAccount['platform'], string> = { qq: 'QQ 音乐', netease: '网易云音乐', kugou: '酷狗音乐', kuwo: '酷我音乐', migu: '咪咕音乐', bilibili: '哔哩哔哩' }
const fallback: PlatformAccount[] = (Object.keys(platformNames) as Array<PlatformAccount['platform']>).map(platform => ({ platform, name: platformNames[platform], connected: false, profile: null, lastSync: null, count: 0, error: '' }))
const accounts = computed(() => {
  const remote = platformSnapshot.value.accounts
  return [...fallback.map(account => remote.find(item => item.platform === account.platform) ?? account), ...remote.filter(account => !(account.platform in platformNames))]
})
const playlistCount = (platform: PlatformAccount['platform']) => platformSnapshot.value.playlists?.filter(playlist => playlist.platform === platform).length ?? 0
const syncableAccounts = computed(() => connectedPlatforms.value.filter(account => account.canSync !== false))
const logoutAccount = ref<PlatformAccount | null>(null)
const formatTime = (time: number) => new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
const hideAvatar = (event: Event) => { (event.target as HTMLImageElement).style.visibility = 'hidden' }
const confirmLogout = (account: PlatformAccount) => { logoutAccount.value = account }
async function logout() { const account = logoutAccount.value; logoutAccount.value = null; if (account) await logoutPlatform(account.platform) }
</script>

<style lang="less">
.ui-platform-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-bottom: 17px; border-bottom: 1px solid var(--modern-border); > a { display: flex; align-items: center; gap: 9px; color: var(--modern-accent-ink); text-decoration: none; font-size: 12px; svg { width: 17px; height: 17px; } strong { font-weight: 500; margin-left: 6px; } } }
.ui-platform-account { display: flex; align-items: center; gap: 15px; padding: 24px 0; border-bottom: 1px solid var(--modern-border); }
.ui-platform-avatar { width: 46px; height: 46px; display: grid; place-items: center; flex: none; background: var(--modern-hover); color: var(--modern-accent-ink); border-radius: 8px; overflow: hidden; img { width: 100%; height: 100%; object-fit: cover; } > svg { width: 23px; height: 23px; } }
.ui-platform-info { min-width: 0; flex: 1; h3 { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; font-size: 13px; font-weight: 600; line-height: 1.7; span { font-size: 10px; font-weight: 400; color: var(--modern-muted); &.connected { color: var(--modern-accent-ink); } } } > p { font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; color: var(--modern-muted); } > small { display: block; margin-top: 3px; font-size: 10px; line-height: 1.8; color: var(--modern-muted); } > .ui-platform-account-notice { margin-top: 5px; font-size: 10px; } > .ui-platform-account-error { color: #c66666; font-size: 11px; margin-top: 5px; } }
.ui-platform-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; justify-content: flex-end; flex: none; }
.ui-platform-status { font-size: 11px; color: var(--modern-muted); margin-top: 15px; }
.ui-platform-error { font-size: 11px; line-height: 1.8; color: #c66666; padding: 12px 0; }
@media (max-width: 850px) { .ui-platform-account { flex-wrap: wrap; gap: 12px; } .ui-platform-actions { width: 100%; padding-left: 58px; box-sizing: border-box; justify-content: flex-start; } }
</style>

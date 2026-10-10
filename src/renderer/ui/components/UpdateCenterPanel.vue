<template>
  <div class="linkline-updates" :aria-busy="updateChecking" :data-status="updateChecking ? 'checking' : updateResult?.status ?? 'idle'">
    <article class="linkline-update-card linkline-update-overview" :class="{ available: updateAvailable, failed: updateResult?.status === 'error' && !updateChecking }">
      <div class="linkline-update-product"><img :src="linklineLogo" alt="LinkLine 标志"><div><h3>LinkLine</h3><p>当前版本 {{ currentVersion }}</p></div></div>
      <div class="linkline-update-status" role="status" aria-live="polite"><UiIcon :name="updateChecking ? 'refresh' : statusIcon" :class="{ spinning: updateChecking }" /><div><strong>{{ statusTitle }}</strong><p>{{ statusDescription }}</p></div></div>
      <div class="linkline-update-actions"><button type="button" class="linkline-update-button" :class="{ primary: !installer }" :disabled="updateChecking" @click="checkAppUpdate(true)"><UiIcon :name="updateChecking ? 'refresh' : 'cloudDownload'" :class="{ spinning: updateChecking }" />{{ updateChecking ? '正在检查…' : updateResult?.status === 'error' ? '重试检查' : '检查更新' }}</button><button v-if="installer && !downloadReady" type="button" class="linkline-update-button primary linkline-update-download" :disabled="downloadState === 'downloading' || installing" @click="downloadInstaller"><UiIcon :name="downloadState === 'downloading' ? 'refresh' : 'download'" :class="{ spinning: downloadState === 'downloading' }" />{{ downloadState === 'downloading' ? '正在下载…' : downloadState === 'error' ? '重试下载' : '下载 Windows x64 安装包' }}</button><button v-if="installer && downloadReady" type="button" class="linkline-update-button primary linkline-update-install" :disabled="installing" @click="installUpdate"><UiIcon :name="installing ? 'refresh' : 'check'" :class="{ spinning: installing }" />{{ installing ? '正在启动安装…' : '安装更新' }}</button><button v-if="hasBackupDownload && !downloadReady" type="button" class="linkline-update-button linkline-update-download-backup" :disabled="downloadState === 'downloading' || installing" @click="downloadBackup"><UiIcon name="download" />国内备用下载</button><button type="button" class="linkline-update-button" @click="openOfficialPage"><UiIcon name="arrowUpRight" />打开官方下载页</button></div>
      <p v-if="installer" class="linkline-update-download-details">{{ installerLabel }} · {{ downloadSourceLabel }}</p>
      <div v-if="installer && downloadState === 'downloading'" class="linkline-update-download-progress" role="status" aria-live="polite"><div class="linkline-update-progress-track"><span :style="{ width: `${downloadPercent}%` }" /></div><span>{{ downloadProgressText }}</span></div>
      <p v-if="downloadState === 'error'" class="linkline-update-download-error" role="alert">下载失败，请重试。</p>
      <p v-if="downloadReady" class="linkline-update-download-ready" role="status">安装包已下载到本机，点击“安装更新”后 LinkLine 将退出并启动安装程序。</p>
      <p v-if="installError" class="linkline-update-download-error" role="alert">{{ installError }}</p>
      <details v-if="installerChecksum" class="linkline-update-checksum"><summary>查看 SHA-256 校验值<UiIcon name="chevronDown" /></summary><code>{{ installerChecksum }}</code></details>
      <p v-if="successfulResult && latestRelease && !installer" class="linkline-update-note">此版本未提供 Windows x64 安装包，可在官方下载页查看其他文件。</p>
      <p class="linkline-update-time">{{ checkedAt ? `最后检查：${checkedAt}` : '尚未完成更新检查' }}</p>
    </article>

    <div class="linkline-update-grid">
      <article class="linkline-update-card"><div class="linkline-update-card-heading"><UiIcon name="refresh" /><h3>启动检查</h3><span class="linkline-update-badge">已开启</span></div><p>每次打开 LinkLine 都会自动检查新版本。有可用更新时，顶部更新按钮会显示提示点。</p></article>
      <article class="linkline-update-card linkline-update-source-card"><div class="linkline-update-card-heading"><UiIcon name="cloudDownload" /><h3>更新下载源</h3></div><UiSelect :model-value="preferredUpdateSource" :options="sourceOptions" aria-label="更新下载源" @change="selectUpdateSource" /><p>{{ sourceDescription }}</p><p v-if="actualSourceLabel" class="linkline-update-actual-source">版本信息来源：{{ actualSourceLabel }}</p><p v-if="fallbackMessage" class="linkline-update-fallback" role="status">{{ fallbackMessage }}</p><p v-if="updateSourceSaveError" class="linkline-update-note" role="status">{{ updateSourceSaveError }}</p><button type="button" class="linkline-update-source" @click="openUrl(LINKLINE_REPOSITORY)">LinkLine GitHub 仓库<UiIcon name="arrowUpRight" /></button></article>
    </div>

    <article class="linkline-update-card linkline-update-notes">
      <div class="linkline-update-card-heading"><div><h3>更新日志</h3><p>查看新版本的变化与改进。</p></div><button type="button" class="linkline-update-button compact" :disabled="updateChecking" aria-label="刷新更新日志" @click="checkAppUpdate(true)"><UiIcon name="refresh" :class="{ spinning: updateChecking }" /></button></div>
      <template v-if="latestRelease"><div class="linkline-update-release-heading"><strong>{{ releaseName }}</strong><time>{{ releaseDate }}</time></div><pre class="linkline-update-release-body">{{ releaseBody }}</pre><p v-if="updateResult?.status === 'error'" class="linkline-update-note">上次成功获取的更新日志。检查失败后可重试获取最新内容。</p></template>
      <p v-else class="linkline-update-empty">{{ updateChecking ? '正在获取更新日志…' : updateResult?.status === 'error' ? '暂时无法获取更新日志，请重试或在官方下载页查看。' : updateResult?.status === 'unpublished' ? '尚未发布正式版本，发布后将在这里显示更新日志。' : '检查更新后将在这里显示版本说明。' }}</p>
      <details v-if="history.length" class="linkline-update-history"><summary>历史版本<span>{{ history.length }}</span><UiIcon name="chevronDown" /></summary><article v-for="release in history" :key="release.pageUrl"><div class="linkline-update-release-heading"><button type="button" @click="openUrl(release.pageUrl)">{{ release.name || `LinkLine ${release.version}` }}<UiIcon name="arrowUpRight" /></button><time>{{ formatDate(release.publishedAt) }}</time></div><pre class="linkline-update-release-body">{{ release.body || '此版本未提供更新说明。' }}</pre></article></details>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { LINKLINE_BACKUP_MIRROR, LINKLINE_RELEASES_URL, LINKLINE_REPOSITORY, releaseAssetDownloadUrl, UPDATE_SOURCES } from '@common/appUpdate'
import { openUrl } from '@common/utils/electron'
import { versionInfo } from '@renderer/store'
import linklineLogo from '@renderer/assets/images/linkline-logo.svg'
import UiIcon from './UiIcon.vue'
import UiSelect from './UiSelect.vue'
import { checkAppUpdate, downloadUpdateInstaller, installDownloadedUpdate, resetUpdateDownload, selectUpdateSource, updateAvailable, updateChecking, updateDownloadedFile, updateDownloadProgress, updateDownloadState, updateResult } from '@renderer/ui/services/appUpdate'
import { preferredUpdateSource, updateSourceSaveError } from '@renderer/ui/services/updatePreferences'

const currentVersion = computed(() => updateResult.value?.currentVersion ?? versionInfo.version)
const checkedAt = computed(() => { const result = updateResult.value; return result?.checkedAt ? new Date(result.checkedAt).toLocaleString('zh-CN', { hour12: false }) : '' })
const latestRelease = computed(() => updateResult.value?.latestRelease ?? null)
const history = computed(() => updateResult.value?.history ?? [])
const releaseName = computed(() => { const release = latestRelease.value; return release?.name ? release.name : `LinkLine ${release?.version ?? ''}` })
const releaseBody = computed(() => { const body = latestRelease.value?.body; return body?.trim() ? body : '此版本未提供更新说明。' })
const releaseDate = computed(() => { const release = latestRelease.value; return release?.publishedAt ? formatDate(release.publishedAt) : '' })
const sourceOptions = [{ value: 'mirror', label: UPDATE_SOURCES.mirror.label }, { value: 'github', label: UPDATE_SOURCES.github.label }]
const sourceDescription = computed(() => preferredUpdateSource.value === 'mirror' ? '第三方提供国内加速，下载 LinkLine 在 GitHub 发布的安装包。可随时切换至 GitHub 官方。' : UPDATE_SOURCES.github.description)
const actualSourceLabel = computed(() => updateChecking.value ? '' : updateResult.value?.sourceLabel ?? '')
const fallbackMessage = computed(() => {
  const result = updateResult.value
  if (updateChecking.value || !result?.usedFallback) return ''
  if (result.requestedSource === 'github') return 'GitHub 接口暂不可用，已通过官方发布清单检查。'
  if (result.status === 'error') return '所选加速源暂不可用，已尝试 GitHub 官方。请重试或切换更新源。'
  if (result.source === 'github') return '国内加速未响应，已通过 GitHub 官方检查；安装包仍使用所选国内加速。'
  return `主要加速源未响应，已通过 ${result.sourceLabel} 检查。`
})
const successfulResult = computed(() => !updateChecking.value && updateResult.value?.requestedSource === preferredUpdateSource.value && (updateResult.value?.status === 'available' || updateResult.value?.status === 'latest'))
const installer = computed(() => {
  if (!successfulResult.value) return null
  const source = preferredUpdateSource.value
  const release = latestRelease.value
  const expectedName = `LinkLine-v${release?.version ?? ''}-x64-Setup.exe`.toLowerCase()
  const asset = release?.assets.find(asset => asset.name.toLowerCase() === expectedName)
  const url = asset ? releaseAssetDownloadUrl(asset.url, source) : null
  const officialUrl = asset ? releaseAssetDownloadUrl(asset.url, 'github') : null
  return asset && url && officialUrl ? { ...asset, downloadUrl: asset.downloadUrl ?? url, backupUrl: source === 'mirror' ? `${LINKLINE_BACKUP_MIRROR}${officialUrl}` : null } : null
})
const hasBackupDownload = computed(() => Boolean(installer.value?.backupUrl))
const installerIdentity = computed(() => {
  const asset = installer.value
  return asset ? `${asset.downloadUrl}|${asset.sha256 ?? ''}` : ''
})
const installerChecksum = computed(() => { const value = installer.value?.sha256; return value && /^[\da-f]{64}$/i.test(value) ? value : '' })
const installerLabel = computed(() => { const asset = installer.value; return asset ? `${asset.name}${asset.size ? ` · ${formatSize(asset.size)}` : ''}` : '' })
const downloadSourceLabel = computed(() => UPDATE_SOURCES[preferredUpdateSource.value].label)
const downloadState = updateDownloadState
const downloadProgress = updateDownloadProgress
const downloadReady = computed(() => downloadState.value === 'downloaded' && updateDownloadedFile.value?.fileName === installer.value?.name)
const installError = ref('')
const installing = ref(false)
const downloadPercent = computed(() => Math.max(0, Math.min(100, downloadProgress.value?.percent ?? 0)))
const formatRate = (value: number) => `${formatSize(Math.max(0, value))}/s`
const downloadProgressText = computed(() => {
  const progress = downloadProgress.value
  if (!progress) return '准备下载…'
  const total = progress.total ? formatSize(progress.total) : '未知大小'
  return `${downloadPercent.value.toFixed(0)}% · ${formatSize(progress.transferred)} / ${total} · ${formatRate(progress.bytesPerSecond)}`
})
const statusTitle = computed(() => {
  if (updateChecking.value) return '正在检查更新…'
  const result = updateResult.value
  switch (result?.status) {
    case 'available': return `发现新版本 ${result.latestRelease?.version ?? ''}`
    case 'latest': return '已是最新版本'
    case 'unpublished': return '尚未发布正式版本'
    case 'error': return '检查更新失败'
    default: return '等待检查更新'
  }
})
const statusDescription = computed(() => {
  if (updateChecking.value) return `正在连接 ${UPDATE_SOURCES[preferredUpdateSource.value].label}。`
  const result = updateResult.value
  switch (result?.status) {
    case 'available': return installer.value ? '新版已发布，选择下方安装包下载即可更新。' : '新版已发布，可以在官方下载页查看下载安装文件。'
    case 'latest': return `最新正式版本 ${result.latestRelease?.version ?? currentVersion.value}`
    case 'unpublished': return '当前测试版可继续使用，正式版本发布后会自动检测。'
    case 'error': return result.error ?? '网络连接超时，请重试或打开官方下载页。'
    default: return '获取最新版本与更新日志。'
  }
})
const statusIcon = computed(() => updateResult.value?.status === 'latest' ? 'check' : updateResult.value?.status === 'error' ? 'connectionError' : 'cloudDownload')
const formatDate = (value: string) => { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleDateString('zh-CN') : '' }
const formatSize = (size: number) => `${(size / 1024 / 1024).toFixed(1)} MB`
const downloadInstaller = async() => {
  const asset = installer.value
  if (!asset) return
  installError.value = ''
  await downloadUpdateInstaller({ url: asset.downloadUrl, fileName: asset.name, ...(asset.sha256 ? { sha256: asset.sha256 } : {}) }).catch(() => {})
}
const downloadBackup = async() => {
  const asset = installer.value
  const url = asset?.backupUrl
  if (!asset || !url) return
  installError.value = ''
  await downloadUpdateInstaller({ url, fileName: asset.name, ...(asset.sha256 ? { sha256: asset.sha256 } : {}) }).catch(() => {})
}
const installUpdate = async() => {
  installError.value = ''
  installing.value = true
  await installDownloadedUpdate().catch((error: unknown) => {
    installError.value = error instanceof Error ? error.message : '无法启动安装程序，请重试。'
  }).finally(() => {
    installing.value = false
  })
}
const openOfficialPage = async() => {
  const result = updateResult.value
  const successful = !updateChecking.value && (result?.status === 'available' || result?.status === 'latest')
  await openUrl(successful ? result.latestRelease?.pageUrl ?? LINKLINE_RELEASES_URL : LINKLINE_RELEASES_URL)
}
watch(installerIdentity, (next, previous) => {
  if (previous !== undefined && next !== previous) resetUpdateDownload()
})
onMounted(() => { if (!updateResult.value) void checkAppUpdate() })
</script>

<style lang="less">
.linkline-updates { display: flex; flex-direction: column; gap: 16px; font-size: 12px; line-height: 1.7; color: var(--modern-text); }
.linkline-update-card { padding: 20px; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); background: var(--modern-panel); min-width: 0; h3 { font-size: 13px; font-weight: 600; } p { color: var(--modern-muted); overflow-wrap: anywhere; } &.available { background: var(--modern-accent-soft); } &.failed .linkline-update-status { color: #c85e5e; } }
.linkline-update-product { display: flex; align-items: center; gap: 13px; margin-bottom: 22px; img { width: 45px; height: 45px; flex: none; } h3 { font-size: 18px; line-height: 1.4; } p { margin-top: 3px; font-size: 11px; } }
.linkline-update-status { display: flex; align-items: flex-start; gap: 10px; svg { width: 21px; height: 21px; margin-top: 2px; } > div { min-width: 0; } strong { font-size: 15px; font-weight: 550; } p { margin-top: 5px; font-size: 11px; } }
.linkline-update-actions { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 18px; }
.linkline-update-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--modern-border); padding: 8px 13px; border-radius: var(--modern-radius-small); color: var(--modern-text); background: var(--modern-panel); font-family: inherit; font-size: 11px; cursor: pointer; svg { width: 16px; height: 16px; } &:hover { background: var(--modern-hover); } &:disabled { opacity: .6; cursor: default; } &.primary { background: var(--modern-accent-ink); color: var(--modern-panel); border-color: transparent; &:hover { opacity: .85; } } &.compact { padding: 7px; flex: none; } }
.linkline-update-time { margin-top: 12px; font-size: 10px; }
.linkline-update-download-details { margin-top: 10px; font-size: 10px; overflow-wrap: anywhere; }
.linkline-update-download-progress { display: flex; align-items: center; gap: 10px; margin-top: 12px; color: var(--modern-muted); font-size: 10px; }
.linkline-update-progress-track { height: 6px; min-width: 100px; flex: 1; overflow: hidden; border-radius: 10px; background: var(--modern-hover); span { display: block; height: 100%; border-radius: inherit; background: var(--modern-accent-ink); transition: width .18s ease; } }
.linkline-update-download-error { margin-top: 9px; color: #c85e5e !important; font-size: 10px; }
.linkline-update-download-ready { margin-top: 9px; color: var(--modern-accent-ink) !important; font-size: 10px; }
.linkline-update-checksum { margin-top: 9px; font-size: 10px; color: var(--modern-muted); summary { cursor: pointer; display: inline-flex; align-items: center; gap: 6px; svg { width: 12px; height: 12px; } } code { display: block; padding-top: 8px; overflow-wrap: anywhere; user-select: text; } }
.linkline-update-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; .linkline-update-card > p { font-size: 11px; margin-top: 9px; } }
.linkline-update-card-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; > svg { width: 17px; height: 17px; color: var(--modern-muted); } > div { flex: 1; min-width: 0; } > div > p { margin-top: 5px; font-size: 11px; } }
.linkline-update-badge { margin-left: auto; flex: none; color: var(--modern-accent-ink); background: var(--modern-accent-soft); padding: 2px 7px; border-radius: 20px; font-size: 9px; }
.linkline-update-source { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; margin-top: 3px; padding: 0; border: 0; background: transparent; color: var(--modern-accent-ink); font: inherit; font-size: 10px; text-align: left; overflow-wrap: anywhere; cursor: pointer; svg { height: 12px; width: 12px; } }
.linkline-update-source-card { .ui-select { margin-top: 11px; } > p { margin-top: 10px; font-size: 11px; } .linkline-update-actual-source { font-size: 10px; } .linkline-update-fallback { padding: 8px 10px; border-radius: 9px; background: var(--modern-accent-soft); color: var(--modern-accent-ink); font-size: 10px; } }
.linkline-update-release-heading { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin: 18px 0 9px; strong, button { font-size: 12px; font-weight: 550; } time { font-size: 10px; color: var(--modern-muted); } button { display: inline-flex; align-items: center; gap: 5px; border: 0; background: transparent; padding: 0; color: var(--modern-accent-ink); font-family: inherit; cursor: pointer; svg { width: 13px; height: 13px; } } }
.linkline-update-release-body { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: 11px; line-height: 1.9; color: var(--modern-muted); user-select: text; }
.linkline-update-empty { padding: 18px 0 6px; font-size: 11px; }
.linkline-update-note { margin-top: 12px; font-size: 10px; }
.linkline-update-history { margin-top: 22px; border-top: 1px solid var(--modern-border); summary { display: flex; align-items: center; gap: 8px; padding-top: 15px; color: var(--modern-muted); cursor: pointer; font-size: 11px; list-style: none; &::-webkit-details-marker { display: none; } > span { font-size: 9px; background: var(--modern-hover); padding: 1px 6px; border-radius: 20px; } > svg { width: 16px; height: 16px; margin-left: auto; transition: transform .15s; } } &[open] > summary > svg { transform: rotate(180deg); } > article { padding-bottom: 15px; border-bottom: 1px solid var(--modern-border); &:last-child { border-bottom: 0; padding-bottom: 0; } } }
.linkline-updates button:focus-visible, .linkline-updates summary:focus-visible { outline: 2px solid var(--modern-accent-ink); outline-offset: 3px; }
.linkline-updates .spinning, .linkline-update-topbar.spinning > svg { animation: linkline-update-spin 1.2s linear infinite; }
@keyframes linkline-update-spin { to { transform: rotate(360deg); } }
@media (max-width: 800px) { .linkline-update-grid { grid-template-columns: minmax(0, 1fr); } .linkline-update-card { padding: 16px; } }
@media (prefers-reduced-motion: reduce) { .linkline-updates .spinning, .linkline-update-topbar.spinning > svg { animation: none; } }
</style>

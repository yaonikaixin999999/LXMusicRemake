<template>
  <aside :class="[$style.aside, { [$style.fullscreen]: isFullscreen }]">
    <div v-if="appSetting['common.controlBtnPosition'] == 'left' && !isFullscreen" :class="$style.windowControls"><ControlBtns /></div>
    <router-link to="/discover" :class="$style.brand" aria-label="LX Music · 发现音乐">
      <span :class="$style.brandIcon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true"><path d="M9 17V6l10-2v11M9 8l10-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /><ellipse cx="6" cy="17" rx="3" ry="2.5" fill="currentColor" /><ellipse cx="16" cy="15" rx="3" ry="2.5" fill="currentColor" /></svg>
      </span>
      <span :class="$style.brandName">LX <span>Music</span></span>
    </router-link>
    <NavBar />
    <div :class="$style.footer">
      <button type="button" :class="$style.appearanceBtn" aria-label="外观定制" @click="appearancePanelOpen = true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5h-.7a1.8 1.8 0 0 1 0-3.6H16A5 5 0 0 0 21 7c-1.4-2.5-4.9-4-9-4Z" stroke="currentColor" stroke-width="1.5" /><circle cx="7.5" cy="9" r="1" fill="currentColor" /><circle cx="11" cy="6.5" r="1" fill="currentColor" /><circle cx="15.5" cy="7" r="1" fill="currentColor" /><circle cx="6.5" cy="13" r="1" fill="currentColor" /></svg>
        <span :class="$style.footerLabel">外观定制</span>
        <span :class="$style.customizeDot" />
      </button>
      <div :class="$style.workspace">
        <span :class="$style.avatar">LX</span>
        <div :class="$style.workspaceInfo"><strong>本地音乐空间</strong><span>随心而听，自由探索</span></div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { isFullscreen } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'
import { appearancePanelOpen } from '@renderer/composables/useAppearance'
import ControlBtns from './ControlBtns.vue'
import NavBar from './NavBar.vue'
</script>

<style lang="less" module>
.aside {
  box-sizing: border-box;
  display: flex;
  flex-flow: column nowrap;
  min-height: 0;
  color: var(--modern-text);
  background: var(--modern-sidebar);
  -webkit-app-region: drag;
  user-select: none;
  transition: background-color .2s;
  &.fullscreen { -webkit-app-region: no-drag; }
}
.windowControls {
  height: 30px;
  flex: none;
  > div { height: 30px; justify-content: flex-start; gap: 9px; padding-left: 22px; }
}
.brand {
  min-height: 68px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 22px;
  color: var(--modern-text);
  text-decoration: none;
  -webkit-app-region: no-drag;
  flex: none;
}
.brandIcon {
  width: 33px;
  height: 33px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--modern-accent);
  background: var(--modern-accent-soft);
  border-radius: 11px;
  flex: none;
}
.brandName { font-size: 20px; letter-spacing: -.6px; font-weight: 700; white-space: nowrap; span { font-weight: 500; } }
.footer { padding: 12px; -webkit-app-region: no-drag; }
.appearanceBtn {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 12px;
  min-height: 42px;
  padding: 0 12px;
  border: 0;
  border-radius: 12px;
  color: var(--modern-muted);
  background: transparent;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background .15s, color .15s;
  svg { flex: none; }
  &:hover, &:focus-visible { background: var(--modern-accent-soft); color: var(--modern-text); }
  &:focus-visible { outline: 2px solid var(--modern-accent); outline-offset: 2px; }
}
.customizeDot { width: 5px; height: 5px; margin-left: auto; border-radius: 50%; background: var(--modern-accent); }
.workspace {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding: 14px 9px 2px;
  border-top: 1px solid var(--modern-border);
}
.avatar {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--modern-border);
  border-radius: 50%;
  font-size: 10px;
  font-weight: 650;
  background: var(--modern-panel);
  flex: none;
}
.workspaceInfo { display: flex; flex-direction: column; gap: 5px; min-width: 0; strong { font-size: 11px; font-weight: 500; white-space: nowrap; } span { font-size: 9px; color: var(--modern-muted); white-space: nowrap; } }
@media (max-width: 1100px) { .brand { padding: 0 19px; } .brandName { font-size: 18px; } .workspaceInfo span { font-size: 8px; } }
@media (max-width: 760px) {
  .brand { justify-content: center; padding: 0; }
  .brandName, .footerLabel, .customizeDot, .workspaceInfo { display: none; }
  .footer { padding: 10px; }
  .appearanceBtn { justify-content: center; padding: 0; }
  .workspace { justify-content: center; padding: 14px 0 2px; }
  .windowControls > div { justify-content: center; padding: 0; }
}
</style>

<template>
  <div class="ui-empty" role="status">
    <div class="ui-empty__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M7 18h10M8 15h8M9 12h6M10 9h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><path d="M6 4h12v16H6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg></div>
    <strong>{{ title }}</strong>
    <p v-if="description">{{ description }}</p>
    <button v-if="retry" type="button" @click="$emit('retry')">再试一次</button>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title?: string, description?: string, retry?: boolean }>(), {
  title: '这里还没有内容',
  description: '',
  retry: false,
})
defineEmits<{ retry: [] }>()
</script>

<style lang="less">
.ui-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 190px; padding: 30px 20px; color: var(--modern-muted); text-align: center; }
.ui-empty__icon { display: grid; place-items: center; width: 42px; height: 42px; margin-bottom: 14px; border-radius: 14px; color: var(--modern-accent-ink); background: var(--modern-accent-soft); svg { width: 24px; height: 24px; } }
.ui-empty strong { color: var(--modern-text); font-size: 13px; font-weight: 550; }
.ui-empty p { margin-top: 7px; font-size: 11px; }
.ui-empty button { margin-top: 14px; padding: 7px 14px; border: 1px solid var(--modern-border); border-radius: 9px; color: var(--modern-accent-ink); background: var(--modern-panel); font: inherit; font-size: 11px; cursor: pointer; &:hover { background: var(--modern-accent-soft); } }
</style>

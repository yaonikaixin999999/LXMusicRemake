<template>
  <nav v-if="pages > 1" class="ui-pagination" aria-label="分页">
    <span>第 {{ page }} / {{ pages }} 页<span v-if="total"> · {{ total.toLocaleString() }} {{ unit }}</span></span>
    <div><button type="button" :disabled="loading || page <= 1" @click="emit('change', page - 1)"><UiIcon name="back" />上一页</button><button type="button" :disabled="loading || page >= pages" @click="emit('change', page + 1)">下一页<UiIcon name="chevronRight" /></button></div>
  </nav>
</template>
<script setup lang="ts">
import UiIcon from './UiIcon.vue'
withDefaults(defineProps<{ page: number, pages: number, total?: number, unit?: string, loading?: boolean }>(), { total: 0, unit: '项', loading: false })
const emit = defineEmits<(event: 'change', page: number) => void>()
</script>
<style lang="less">
.ui-pagination button svg { width: 14px; height: 14px; }
.ui-pagination { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 18px 2px; font-size: 11px; color: var(--modern-muted); div { display: flex; gap: 7px; } button { padding: 8px 12px; border: 1px solid var(--modern-border); border-radius: 10px; background: var(--modern-panel); color: var(--modern-text); font-family: inherit; font-size: 11px; cursor: pointer; &:hover { background: var(--modern-hover); } &:disabled { opacity: .35; cursor: default; } } }
</style>

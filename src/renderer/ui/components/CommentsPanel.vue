<template>
  <UiModal :show="true" :title="`${track.name} · 评论`" width="600px" @close="$emit('close')">
    <div class="ui-tabs"><button type="button" :class="{ 'ui-active': kind === 'hot' }" @click="kind = 'hot'">热门评论</button><button type="button" :class="{ 'ui-active': kind === 'new' }" @click="kind = 'new'">最新评论</button></div>
    <p v-if="loading" class="ui-empty">正在载入评论…</p>
    <p v-else-if="error" class="ui-empty">{{ error }}</p>
    <p v-else-if="!list.length" class="ui-empty">暂无评论</p>
    <template v-else><CommentItem v-for="(comment, i) in list" :key="comment.id ?? i" :comment="comment" /></template>
    <div class="ui-pagination"><button type="button" class="ui-button" :disabled="page <= 1 || loading" @click="page--">上一页</button><span>{{ page }}</span><button type="button" class="ui-button" :disabled="page * 20 >= total || loading" @click="page++">下一页</button></div>
  </UiModal>
</template>
<script setup>
import { ref, watch } from 'vue'
import music from '@renderer/utils/musicSdk'
import { toOldMusicInfo } from '@renderer/utils'
import UiModal from './UiModal.vue'
import CommentItem from './CommentItem.vue'
const props = defineProps({ track: { type: Object, required: true } })
defineEmits(['close'])
const kind = ref('hot')
const page = ref(1)
const loading = ref(false)
const error = ref('')
const list = ref([])
const total = ref(0)
let requestId = 0
watch([kind, () => props.track.id], () => { page.value = 1 })
watch([kind, page, () => props.track.id], async() => {
  const id = ++requestId
  const api = music[props.track.source]?.comment
  const method = kind.value === 'hot' ? 'getHotComment' : 'getComment'
  list.value = []
  total.value = 0
  loading.value = false
  error.value = ''
  if (!api?.[method]) { error.value = '这个音乐平台暂不支持评论。'; return }
  loading.value = true
  try {
    const result = await api[method](toOldMusicInfo(props.track), page.value, 20)
    if (id === requestId) { list.value = result.comments; total.value = result.total }
  } catch {
    if (id === requestId) error.value = '评论暂时无法获取，请稍后重试。'
  } finally {
    if (id === requestId) loading.value = false
  }
}, { immediate: true })
</script>

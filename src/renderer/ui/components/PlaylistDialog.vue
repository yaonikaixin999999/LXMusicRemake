<template>
  <UiModal :show="show" :title="dialogTitle" :subtitle="action === 'delete' ? '歌单和其中的歌曲记录将从音乐库移除。' : '给喜欢的音乐，一个专属的位置。'" @close="emit('close')">
    <div v-if="error" class="ui-dialog-error" role="alert">{{ error }}</div>
    <p v-if="action === 'delete'" class="ui-dialog-note">确认删除「{{ listInfo?.name }}」？本地音乐文件不会被删除。</p>
    <form v-else id="ui-playlist-form" @submit.prevent="submit"><label class="ui-dialog-field"><span>歌单名称</span><input v-model="name" maxlength="80" placeholder="比如：漫长旅途的背景音乐" autofocus></label></form>
    <template #footer><button type="button" class="ui-dialog-button" :disabled="busy" @click="emit('close')">取消</button><button type="button" class="ui-dialog-button" :class="action === 'delete' ? 'ui-dialog-button-danger' : 'ui-dialog-button-primary'" :disabled="busy || (action !== 'delete' && !name.trim())" @click="submit">{{ busy ? '正在保存…' : action === 'delete' ? '删除歌单' : '保存歌单' }}</button></template>
  </UiModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiModal from './UiModal.vue'
import { createUserList, removeUserList, updateUserList } from '@renderer/store/list/action'
import { userLists } from '@renderer/store/list/state'
interface PlaylistProps { show: boolean, action: 'create' | 'rename' | 'delete', listInfo: LX.List.UserListInfo | null }
const props: PlaylistProps = defineProps<PlaylistProps>()
const emit = defineEmits<{ (event: 'close'): void, (event: 'saved', id: string): void }>()
const titles = { create: '创建一个新歌单', rename: '重命名歌单', delete: '删除歌单' }
const dialogTitle = computed(() => titles[props.action])
const name = ref('')
const busy = ref(false)
const error = ref('')
watch(() => props.show, show => { if (show) { name.value = props.action === 'rename' ? props.listInfo?.name ?? '' : ''; error.value = '' } })
async function submit() {
  if (busy.value) return
  const value = name.value.trim()
  if (props.action !== 'delete' && !value) return
  if (props.action !== 'delete' && userLists.some(item => item.name === value && (props.action === 'create' || item.id !== props.listInfo?.id))) { error.value = '已有同名歌单，请换一个名字。'; return }
  busy.value = true
  error.value = ''
  try {
    let id = props.action === 'create' ? `userlist_${crypto.randomUUID()}` : props.listInfo?.id ?? ''
    if (props.action === 'create') await createUserList({ id, name: value })
    else if (props.action === 'rename' && props.listInfo) await updateUserList([{ ...props.listInfo, name: value }])
    else if (props.action === 'delete' && props.listInfo) { await removeUserList([id]); id = 'default' }
    emit('saved', id)
    emit('close')
  } catch (err) { error.value = err instanceof Error ? err.message : '歌单保存失败。' } finally { busy.value = false }
}
</script>

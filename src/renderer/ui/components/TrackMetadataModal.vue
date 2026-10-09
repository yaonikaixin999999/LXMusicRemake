<template>
  <UiModal :show="show" title="编辑歌曲信息" subtitle="为音乐库中的这首歌曲更新显示信息。" @close="emit('close')">
    <div v-if="error" class="ui-dialog-error" role="alert">{{ error }}</div>
    <form @submit.prevent="save"><label class="ui-dialog-field"><span>歌曲名称</span><input v-model="name" maxlength="200" required></label><label class="ui-dialog-field"><span>歌手</span><input v-model="singer" maxlength="200"></label><label class="ui-dialog-field"><span>专辑</span><input v-model="album" maxlength="200"></label></form>
    <p class="ui-dialog-note">更新仅作用于此歌单中的歌曲记录。</p>
    <template #footer><button type="button" class="ui-dialog-button" :disabled="busy" @click="emit('close')">取消</button><button type="button" class="ui-dialog-button ui-dialog-button-primary" :disabled="busy || !name.trim()" @click="save">{{ busy ? '保存中…' : '保存信息' }}</button></template>
  </UiModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import UiModal from './UiModal.vue'
import { updateListMusics } from '@renderer/store/list/action'
const props = defineProps<{ show: boolean, track: LX.Music.MusicInfo | null, listId: string }>()
const emit = defineEmits<{ (event: 'close'): void, (event: 'saved'): void }>()
const name = ref('')
const singer = ref('')
const album = ref('')
const busy = ref(false)
const error = ref('')
watch(() => props.show, show => {
  if (!show || !props.track) return
  name.value = props.track.name
  singer.value = props.track.singer
  album.value = props.track.meta.albumName
  error.value = ''
})
async function save() {
  if (!props.track || busy.value || !name.value.trim()) return
  busy.value = true
  try {
    const track: LX.Music.MusicInfo = { ...props.track }
    track.name = name.value.trim()
    track.singer = singer.value.trim()
    track.meta = { ...track.meta, albumName: album.value.trim() }
    await updateListMusics([{ id: props.listId, musicInfo: track }])
    emit('saved')
    emit('close')
  } catch (err) { error.value = err instanceof Error ? err.message : '歌曲信息保存失败。' } finally { busy.value = false }
}
</script>

<template>
  <article class="ui-comment">
    <header><img v-if="comment.avatar" :src="comment.avatar" alt="" loading="lazy"><strong>{{ comment.userName }}</strong><small>{{ comment.timeStr }}</small></header>
    <p>{{ comment.text }}</p>
    <div v-if="comment.images?.length" class="ui-comment-images"><img v-for="(url, i) in comment.images" :key="i" :src="url" alt="评论图片" loading="lazy"></div>
    <small v-if="comment.likedCount != null" class="ui-comment-likes"><UiIcon name="heart" />{{ comment.likedCount }}</small>
    <div v-if="comment.reply?.length" class="ui-comment-replies"><CommentItem v-for="(reply, i) in comment.reply" :key="reply.id ?? i" :comment="reply" /></div>
  </article>
</template>
<script setup>
import UiIcon from '@renderer/ui/components/UiIcon.vue'
defineProps({ comment: { type: Object, required: true } })
</script>
<style scoped lang="less">
.ui-comment p { white-space: pre-wrap; overflow-wrap: anywhere; }
.ui-comment-images { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; img { max-width: 100%; width: 120px; max-height: 160px; object-fit: contain; border-radius: 8px; } }
.ui-comment-replies { margin-top: 12px; padding: 0 14px; border-left: 2px solid var(--modern-border); border-radius: 8px; background: var(--modern-bg); .ui-comment:last-child { border-bottom: 0; } }
</style>

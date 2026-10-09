<template>
  <div :class="$style.searchInput">
    <material-search-input v-model="searchText" placeholder="搜索歌曲、歌手、歌单…" :list="tipList" :visible-list="visibleList" @event="handleEvent" />
  </div>
</template>

<script>
import music from '@renderer/utils/musicSdk'
import { debounce } from '@common/utils'
import {
  ref,
  watch,
  nextTick,
} from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import { appSetting } from '@renderer/store/setting'
import { searchText as _searchText } from '@renderer/store/search/state'
import { setSearchText } from '@renderer/store/search/action'
import { getSearchSetting } from '@renderer/utils/data'

export default {
  setup() {
    const searchText = ref('')
    const visibleList = ref(false)
    const tipList = ref([])
    let isFocused = false
    let prevTempSearchSource = ''

    const route = useRoute()
    const router = useRouter()

    watch(() => route.name, (newValue, oldValue) => {
      if (oldValue == 'Search' && newValue != 'SongListDetail') {
        setTimeout(() => {
          if (appSetting['odc.isAutoClearSearchInput'] && searchText.value) searchText.value = ''
          if (appSetting['odc.isAutoClearSearchList']) setSearchText('')
        })
      }
    })

    watch(_searchText, (newValue, oldValue) => {
      searchText.value = newValue
      if (newValue !== searchText.value) searchText.value = newValue
    })
    watch(searchText, () => {
      handleTipSearch()
    })


    const tipSearch = debounce(async() => {
      if (searchText.value === '' && prevTempSearchSource) {
        tipList.value = []
        music[prevTempSearchSource].tipSearch.cancelTipSearch()
        return
      }
      const { temp_source } = await getSearchSetting()
      prevTempSearchSource ||= temp_source
      music[prevTempSearchSource].tipSearch.search(searchText.value).then(list => {
        tipList.value = list
      }).catch(() => {})
    }, 50)

    const handleTipSearch = () => {
      if (!visibleList.value && isFocused) visibleList.value = true
      tipSearch()
    }

    const handleSearch = () => {
      visibleList.value &&= false
      if (!searchText.value && route.path != '/search') {
        setSearchText('')
        return
      }
      setTimeout(() => {
        router.push({
          path: '/search',
          query: {
            text: searchText.value,
          },
        }).catch(_ => _)
      }, searchText.value ? 200 : 0)
    }

    const handleEvent = ({ action, data }) => {
      switch (action) {
        case 'focus':
          isFocused = true
          visibleList.value ||= true
          if (searchText.value) handleTipSearch()
          break
        case 'blur':
          isFocused = false
          setTimeout(() => {
            visibleList.value &&= false
          }, 50)
          break
        case 'submit':
          handleSearch()
          break
        case 'listClick':
          searchText.value = tipList.value[data]
          void nextTick(handleSearch)
      }
    }

    return {
      searchText,
      visibleList,
      tipList,
      handleEvent,
    }
  },
}

</script>

<style lang="less" module>
.searchInput {
  width: clamp(180px, 26vw, 300px);
  height: 36px;
  flex: none;
  -webkit-app-region: no-drag;
  > div {
    width: 100%;
    height: 36px;
    > div {
      background: var(--modern-panel) !important;
      border: 1px solid var(--modern-border);
      border-radius: 18px;
      box-shadow: none;
      overflow: hidden;
      &:focus-within { border-color: var(--modern-accent); box-shadow: 0 0 0 3px var(--modern-accent-soft); }
      > div:first-child {
        height: 34px;
        input { padding-left: 15px; color: var(--modern-text); background: transparent !important; border-radius: 0 !important; font-size: 11px; &::placeholder { color: var(--modern-muted); } }
        button { color: var(--modern-muted); padding: 9px 11px; }
      }
      ul { color: var(--modern-text); }
      li { padding: 11px 14px; &:hover { background: var(--modern-accent-soft); } }
    }
  }
}
@media (max-width: 760px) { .searchInput { width: clamp(145px, 30vw, 240px); } }
</style>

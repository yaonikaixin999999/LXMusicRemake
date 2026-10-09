<template>
  <div :class="$style.page">
    <div :class="$style.content">
      <header :class="$style.heading">
        <div>
          <p :class="$style.eyebrow">A LITTLE MUSIC, A BETTER DAY</p>
          <h1>好的音乐，刚刚好。</h1>
          <p :class="$style.subtitle">从熟悉的旋律，到下一首心动。</p>
        </div>
        <button type="button" :class="$style.customize" aria-label="自定义首页" @click="appearancePanelOpen = true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16M9 4v6M15 14v6" /></svg>
          <span>自定义首页</span>
        </button>
      </header>

      <section :class="$style.hero" aria-labelledby="discover-hero-title">
        <div :class="$style.heroContent">
          <span :class="$style.heroTag"><span /> 让心情慢下来</span>
          <h2 id="discover-hero-title">给此刻，<br>一点好音乐。</h2>
          <p>戴上耳机，把世界调成喜欢的频率。<br>你的下一段旋律，从这里开始。</p>
          <router-link to="/songList/list" :class="$style.primaryAction">
            探索歌单
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
          </router-link>
        </div>
        <div :class="$style.heroArt" aria-hidden="true">
          <div :class="$style.orbit" />
          <div :class="$style.albumSleeve"><span>THE<br>QUIET<br>MOMENTS.</span><i /><small>VOL. 01 / LX MUSIC</small></div>
          <div :class="$style.vinyl"><div :class="$style.vinylLabel"><span>LX</span><i /></div></div>
          <div :class="$style.soundNote"><span :class="$style.soundBars"><i /><i /><i /><i /><i /></span><div>音乐，随心而听<small>Find your own rhythm</small></div></div>
          <span :class="$style.artStar">✳</span>
        </div>
      </section>

      <section v-if="appearance.showExplore" :class="$style.section" aria-labelledby="explore-title">
        <div :class="$style.sectionHeading">
          <div><h2 id="explore-title">此刻，想听点什么？</h2><p>选一种心情，让音乐接着说。</p></div>
          <router-link to="/songList/list" :class="$style.textLink">全部歌单 <span>↗</span></router-link>
        </div>
        <div :class="$style.moods">
          <router-link v-for="mood in moods" :key="mood.id" :to="{ path: '/search', query: { text: mood.query, type: 'songlist', page: '1' } }" :class="$style.mood" :aria-label="`搜索${mood.title}歌单`">
            <div :class="[$style.moodArt, $style[mood.id]]" aria-hidden="true">
              <span :class="$style.moodCode">{{ mood.caption }}</span><i :class="$style.shapeOne" /><i :class="$style.shapeTwo" /><i :class="$style.shapeThree" />
              <span :class="$style.artWord">{{ mood.word }}</span>
              <span :class="$style.moodArrow"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg></span>
            </div>
            <h3>{{ mood.title }}</h3><p>{{ mood.description }}</p>
          </router-link>
        </div>
      </section>

      <section :class="$style.section" aria-labelledby="library-title">
        <div :class="$style.sectionHeading">
          <div><h2 id="library-title">你的音乐空间</h2><p>喜欢的声音，随时回到身边。</p></div>
          <router-link to="/list" :class="$style.textLink">打开音乐库 <span>↗</span></router-link>
        </div>
        <div :class="$style.library">
          <router-link :to="{ path: '/list', query: { id: loveList.id } }" :class="$style.libraryCard">
            <span :class="[$style.libraryIcon, $style.heart]"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg></span>
            <div><h3>我的收藏</h3><p>收好每一首心动</p></div><span :class="$style.cardArrow">↗</span>
          </router-link>
          <router-link to="/list" :class="$style.libraryCard">
            <span :class="[$style.libraryIcon, $style.collection]"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h8M18 10v9m0-9 4-1v8m-4 2c0 1-1 2-2 2s-2-1-2-2 1-2 2-2 2 1 2 2Zm4-2c0 1-1 2-2 2s-2-1-2-2 1-2 2-2 2 1 2 2Z" /></svg></span>
            <div><h3>我的歌单</h3><p>{{ userLists.length ? `${userLists.length} 个属于你的音乐故事` : '为生活整理一份原声带' }}</p></div><span :class="$style.cardArrow">↗</span>
          </router-link>
          <button v-if="musicInfo.id" type="button" :class="$style.libraryCard" @click="isShowPlayerDetail = true">
            <span :class="[$style.libraryIcon, $style.current]"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4M8 6v12M12 3v18M16 6v12M20 10v4" /></svg></span>
            <div><h3>{{ musicInfo.name }}</h3><p>{{ musicInfo.singer || '打开正在播放' }}</p></div><span :class="$style.cardArrow">↗</span>
          </button>
          <router-link v-else to="/leaderboard" :class="$style.libraryCard">
            <span :class="[$style.libraryIcon, $style.current]"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10h4v10m2 0V4h4v16m2 0V7h4v13M2 20h20" /></svg></span>
            <div><h3>音乐排行榜</h3><p>发现大家正在听的好歌</p></div><span :class="$style.cardArrow">↗</span>
          </router-link>
        </div>
        <div v-if="userLists.length" :class="$style.personalLists">
          <router-link v-for="list in userLists.slice(0, 4)" :key="list.id" :to="{ path: '/list', query: { id: list.id } }"><span>♫</span>{{ list.name }}<span>→</span></router-link>
        </div>
      </section>
      <footer :class="$style.footer"><span>LX MUSIC</span> 音乐无界，热爱不止。<i /> 好音乐，常相伴。</footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { appearance, appearancePanelOpen } from '@renderer/composables/useAppearance'
import { userLists, loveList } from '@renderer/store/list/state'
import { musicInfo, isShowPlayerDetail } from '@renderer/store/player/state'

const moods = [
  { id: 'focus', title: '专注时刻', description: '让思绪安静，让灵感发生', caption: '01 / FOCUS', word: 'stay focused.', query: '专注 纯音乐' },
  { id: 'relax', title: '松弛日常', description: '不赶时间，只听喜欢的', caption: '02 / SLOW DOWN', word: 'take it easy.', query: '放松 治愈' },
  { id: 'night', title: '深夜漫游', description: '陪你走过城市的另一面', caption: '03 / AFTER HOURS', word: 'after hours.', query: '深夜 氛围' },
  { id: 'energy', title: '活力满格', description: '跟着节拍，找回好状态', caption: '04 / GOOD ENERGY', word: 'feel the beat.', query: '运动 活力' },
]
</script>

<style lang="less" module>
.page { overflow: auto; overscroll-behavior: contain; color: var(--modern-text); }
.content { max-width: 1180px; padding: 28px 30px 20px; margin: 0 auto; }
.heading { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 25px; }
.eyebrow { font-size: 9px; font-weight: 600; letter-spacing: 2px; color: var(--modern-muted); margin-bottom: 12px; }
.heading h1 { font-size: 25px; font-weight: 600; letter-spacing: -.7px; line-height: 1.35; }
.subtitle { font-size: 12px; color: var(--modern-muted); margin-top: 8px; }
.customize { display: flex; align-items: center; gap: 7px; padding: 9px 12px; border: 1px solid var(--modern-border); border-radius: 9px; background: var(--modern-panel); color: var(--modern-muted); font-size: 11px; cursor: pointer; white-space: nowrap; transition: background .2s, color .2s; }
.customize:hover { background: var(--modern-accent-soft); color: var(--modern-accent-ink); }
.page svg { height: 18px; width: 18px; fill: none; stroke: currentColor; stroke-width: 1.65; stroke-linecap: round; stroke-linejoin: round; }
.hero { position: relative; display: flex; min-height: 263px; overflow: hidden; border: 1px solid var(--modern-border); border-radius: var(--modern-radius); background: var(--modern-hero-bg, #e9efea); }
.heroContent { position: relative; z-index: 2; padding: 30px 32px; width: 53%; box-sizing: border-box; }
.heroTag { display: inline-flex; align-items: center; gap: 7px; color: var(--modern-accent-ink); font-size: 10px; letter-spacing: .5px; }
.heroTag > span { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.hero h2 { font-size: 33px; font-weight: 600; line-height: 1.4; letter-spacing: -1px; margin: 13px 0 12px; }
.heroContent > p { color: var(--modern-muted); font-size: 11px; line-height: 1.85; }
.primaryAction { display: inline-flex; align-items: center; gap: 19px; margin-top: 19px; padding: 10px 14px; border-radius: 9px; background: var(--modern-text); color: var(--modern-panel); font-size: 11px; font-weight: 500; text-decoration: none; transition: transform .2s, opacity .2s; }
.primaryAction:hover { transform: translateY(-2px); opacity: .9; }
.primaryAction svg { width: 13px; height: 13px; }
.heroArt { position: absolute; width: 46%; top: 0; right: 0; bottom: 0; }
.orbit { position: absolute; width: 265px; height: 265px; border: 1px solid var(--modern-border); border-radius: 50%; right: 15px; top: 19px; }
.orbit::after { content: ''; position: absolute; inset: 20px; border: 1px solid var(--modern-border); border-radius: 50%; }
.albumSleeve { width: 167px; height: 192px; position: absolute; top: 40px; left: 14%; z-index: 2; transform: rotate(-10deg); background: #8da796; color: #f0f3e9; border: 1px solid #ffffff38; border-radius: 3px; box-shadow: 0 14px 30px #20362a25; padding: 17px; box-sizing: border-box; overflow: hidden; }
.albumSleeve > span { position: relative; z-index: 1; font-size: 22px; font-weight: 700; letter-spacing: -.5px; line-height: 1.05; }
.albumSleeve > i { position: absolute; width: 140px; height: 140px; border-radius: 50%; background: #c8d3b6; right: -42px; bottom: -29px; }
.albumSleeve > i::after { content: ''; position: absolute; width: 125px; height: 125px; border-radius: 50%; background: #8da796; right: 32px; top: -10px; }
.albumSleeve > small { position: absolute; bottom: 16px; left: 17px; font-size: 7px; letter-spacing: 1.1px; }
.vinyl { position: absolute; top: 49px; right: 13%; width: 186px; height: 186px; border-radius: 50%; background: repeating-radial-gradient(circle at center, #272b29 0, #272b29 2px, #383c39 3px, #272b29 4px); box-shadow: 5px 11px 23px #18251b30; transform: rotate(20deg); }
.vinyl::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: conic-gradient(transparent 0deg, #ffffff1f 38deg, transparent 70deg, transparent 180deg, #ffffff12 210deg, transparent 245deg); }
.vinylLabel { display: flex; align-items: center; justify-content: center; flex-direction: column; position: absolute; inset: 62px; border-radius: 50%; color: #f4f5e9; background: #98a986; font-size: 12px; font-weight: 600; letter-spacing: 2px; }
.vinylLabel i { width: 7px; height: 7px; background: #282e29; border-radius: 50%; margin-top: 6px; }
.soundNote { position: absolute; bottom: 27px; right: 25px; z-index: 3; display: flex; gap: 12px; align-items: center; background: var(--modern-panel); border: 1px solid var(--modern-border); border-radius: 12px; padding: 13px 17px; box-shadow: 0 6px 20px #2632290a; transform: rotate(3deg); }
.soundNote > div { font-size: 10px; font-weight: 500; }
.soundNote small { display: block; font-size: 8px; letter-spacing: .5px; color: var(--modern-muted); margin-top: 5px; }
.soundBars { height: 24px; display: flex; align-items: center; gap: 3px; color: var(--modern-accent-ink); }
.soundBars i { width: 3px; height: 10px; border-radius: 3px; background: currentColor; }
.soundBars i:nth-child(2), .soundBars i:nth-child(4) { height: 17px; }
.soundBars i:nth-child(3) { height: 24px; }
.artStar { position: absolute; top: 20px; right: 25px; font-size: 34px; font-weight: 400; color: #849e88; }
.section { margin-top: 28px; }
.sectionHeading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 17px; }
.sectionHeading h2 { font-size: 16px; font-weight: 600; letter-spacing: -.3px; }
.sectionHeading p { font-size: 10px; color: var(--modern-muted); margin-top: 7px; }
.textLink { font-size: 10px; color: var(--modern-muted); text-decoration: none; white-space: nowrap; display: flex; align-items: center; gap: 7px; }
.textLink span { font-size: 16px; }
.textLink:hover { color: var(--modern-accent-ink); }
.moods { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--modern-gap); }
.mood { text-decoration: none; color: inherit; min-width: 0; }
.moodArt { height: 139px; position: relative; border-radius: max(8px, calc(var(--modern-radius) - 5px)); overflow: hidden; transition: transform .25s; }
.mood:hover .moodArt { transform: translateY(-4px); }
.moodCode { position: absolute; z-index: 2; left: 14px; top: 13px; font-size: 7px; font-weight: 500; letter-spacing: 1.1px; }
.artWord { position: absolute; z-index: 2; left: 14px; bottom: 17px; max-width: 90px; font-size: 21px; font-weight: 500; line-height: 1.05; letter-spacing: -1px; }
.moodArrow { display: flex; align-items: center; justify-content: center; position: absolute; right: 12px; bottom: 13px; z-index: 3; width: 24px; height: 24px; border: 1px solid currentColor; border-radius: 50%; opacity: 0; transform: translateX(-4px); transition: opacity .2s, transform .2s; }
.mood:hover .moodArrow, .mood:focus-visible .moodArrow { opacity: 1; transform: translateX(0); }
.moodArrow svg { width: 12px; height: 12px; }
.mood h3 { font-size: 12px; font-weight: 500; margin-top: 11px; }
.mood > p { font-size: 9px; color: var(--modern-muted); line-height: 1.5; margin-top: 6px; }
.moodArt i { position: absolute; display: block; }
.focus { background: #dce4d7; color: #415545; }
.focus .shapeOne { width: 103px; height: 103px; border-radius: 50%; background: #b5c3aa; right: -12px; top: 16px; }
.focus .shapeTwo { width: 81px; height: 81px; border: 1px solid #8b9d7e; border-radius: 50%; right: -1px; top: 27px; }
.focus .shapeThree { width: 60px; height: 60px; border: 1px solid #8b9d7e; border-radius: 50%; right: 10px; top: 38px; }
.relax { background: #eee3d6; color: #795d43; }
.relax .shapeOne { width: 130px; height: 150px; border-radius: 50% 50% 0 0; background: #c9b294; right: -28px; top: 36px; transform: rotate(-25deg); }
.relax .shapeTwo { width: 96px; height: 135px; border-radius: 50% 50% 0 0; background: #e3d2bd; right: -6px; top: 52px; transform: rotate(-25deg); }
.relax .shapeThree { width: 34px; height: 34px; background: #f9f3e8; border-radius: 50%; right: 40px; top: 29px; }
.night { background: #dfe1ec; color: #585c7b; }
.night .shapeOne { width: 105px; height: 105px; background: #a6abc4; border-radius: 50%; right: -5px; top: 23px; }
.night .shapeTwo { width: 101px; height: 101px; background: #dfe1ec; border-radius: 50%; right: -21px; top: 6px; }
.night .shapeThree { width: 5px; height: 5px; background: #8a90af; border-radius: 50%; right: 35px; top: 49px; box-shadow: -32px -17px 0 -1px #8a90af, 10px 32px 0 -1px #8a90af, -36px 34px 0 -1px #8a90af; }
.energy { background: #e9dcd5; color: #805b4c; }
.energy .shapeOne, .energy .shapeTwo, .energy .shapeThree { width: 44px; height: 130px; border: 1px solid #b7907c; border-radius: 50%; top: 9px; right: 28px; transform: rotate(35deg); }
.energy .shapeTwo { transform: rotate(65deg); }
.energy .shapeThree { transform: rotate(95deg); }
.library { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.libraryCard { display: flex; align-items: center; gap: 11px; padding: 15px 13px; text-align: left; border: 1px solid var(--modern-border); border-radius: max(8px, calc(var(--modern-radius) - 4px)); background: var(--modern-panel); color: var(--modern-text); text-decoration: none; cursor: pointer; min-width: 0; transition: border-color .2s, background .2s; }
.libraryCard:hover { border-color: var(--modern-accent); background: var(--modern-accent-soft); }
.libraryCard > div { flex: 1; min-width: 0; }
.libraryCard h3 { font-size: 11px; font-weight: 500; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.libraryCard p { font-size: 9px; color: var(--modern-muted); margin-top: 6px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.libraryIcon { width: 35px; height: 35px; border-radius: 10px; flex: none; display: flex; align-items: center; justify-content: center; }
.libraryIcon svg { width: 18px; height: 18px; stroke-width: 1.5; }
.heart { background: #ede0dd; color: #9b7066; }
.collection { background: #e5e9df; color: #738666; }
.current { background: #e3e3ed; color: #7a7b9a; }
.cardArrow { flex: none; font-size: 14px; color: var(--modern-muted); }
.personalLists { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 12px; }
.personalLists a { display: flex; align-items: center; gap: 9px; border: 1px solid var(--modern-border); border-radius: 8px; padding: 8px 10px; color: var(--modern-muted); text-decoration: none; font-size: 10px; }
.personalLists a:hover { color: var(--modern-accent-ink); }
:global(html[data-modern-density='compact']) .content { padding-top: 20px; }
:global(html[data-modern-density='compact']) .heading { margin-bottom: 18px; }
:global(html[data-modern-density='compact']) .section { margin-top: 20px; }
:global(html[data-modern-density='compact']) .libraryCard { padding-top: 10px; padding-bottom: 10px; }
.footer { display: flex; align-items: center; justify-content: center; gap: 10px; color: var(--modern-muted); font-size: 8px; margin-top: 32px; opacity: .65; }
.footer > span { font-size: 8px; letter-spacing: 1.5px; }
.footer i { height: 3px; width: 3px; border-radius: 50%; background: currentColor; }
@media (min-width: 1400px) { .hero { min-height: 300px; } .heroContent { padding: 34px 40px; } .hero h2 { font-size: 39px; } .heroArt { right: 25px; top: 15px; } .moodArt { height: 170px; } }
@media (max-width: 1100px) { .content { padding: 24px 23px 20px; } .heroContent { padding: 25px; } .hero h2 { font-size: 29px; } .albumSleeve { left: 5%; width: 150px; height: 177px; top: 49px; } .vinyl { width: 165px; height: 165px; top: 57px; right: 5%; } .vinylLabel { inset: 55px; } .moodArt { height: 125px; } .moods { gap: 12px; } .libraryCard { gap: 9px; padding: 13px 10px; } .libraryIcon { width: 30px; height: 30px; } }
@media (max-width: 900px) { .content { padding: 20px; } .heroArt { width: 43%; right: -10px; } .albumSleeve { width: 128px; height: 153px; top: 58px; } .albumSleeve > span { font-size: 19px; } .vinyl { width: 140px; height: 140px; top: 68px; } .vinylLabel { inset: 46px; } .soundNote { bottom: 29px; right: 18px; padding: 10px 12px; } .heroContent { width: 60%; } .library { gap: 8px; } .cardArrow { display: none; } }
@media (max-width: 600px) { .content { padding: 18px 15px; } .eyebrow { font-size: 7px; letter-spacing: 1px; } .heading h1 { font-size: 22px; } .customize { padding: 8px; } .customize > span { display: none; } .heroContent { padding: 21px; width: 73%; } .hero h2 { font-size: 27px; } .heroArt { opacity: .3; right: -55px; width: 50%; } .soundNote { display: none; } .moods { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 19px 12px; } .moodArt { height: 135px; } .library { grid-template-columns: 1fr; } .libraryIcon { width: 35px; height: 35px; } .cardArrow { display: block; } .footer { flex-wrap: wrap; line-height: 1.5; } }
@media (prefers-reduced-motion: reduce) { .page *, .page *::before, .page *::after { transition: none !important; } }
</style>

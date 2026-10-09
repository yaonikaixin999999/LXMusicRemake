<template>
  <input class="ui-range" type="range" :min="min" :max="max" :step="step" :value="modelValue" :style="{ '--range-progress': `${progress}%` }" @input="input" @change="change">
</template>
<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(defineProps<{ modelValue: number, min?: number, max?: number, step?: number }>(), { min: 0, max: 1, step: 0.01 })
const emit = defineEmits<{ 'update:modelValue': [value: number], input: [value: number], change: [value: number] }>()
const progress = computed(() => Math.max(0, Math.min(100, (props.modelValue - props.min) / (props.max - props.min || 1) * 100)))
function input(event: Event) { const value = Number((event.target as HTMLInputElement).value); emit('update:modelValue', value); emit('input', value) }
function change(event: Event) { emit('change', Number((event.target as HTMLInputElement).value)) }
</script>
<style lang="less">
input.ui-range { appearance: none; -webkit-appearance: none; display: block; min-width: 0; height: 18px; margin: 0; padding: 0; border: 0; background: transparent; cursor: pointer; &::-webkit-slider-runnable-track { height: 3px; border-radius: 5px; background: linear-gradient(to right, var(--modern-accent) 0 var(--range-progress), var(--modern-border) var(--range-progress) 100%); } &::-webkit-slider-thumb { appearance: none; -webkit-appearance: none; width: 10px; height: 10px; margin-top: -3.5px; border: 0; border-radius: 50%; background: var(--modern-accent); box-shadow: 0 0 0 2px var(--modern-panel); } &:hover::-webkit-slider-thumb { box-shadow: 0 0 0 3px var(--modern-accent-soft); } &:disabled { cursor: default; opacity: .4; } }
</style>

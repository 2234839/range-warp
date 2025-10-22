<script setup lang="ts">
  /** 卡片组件的属性 */
  interface Props {
    /** 标题 */
    title: string;
    /** 描述文字 */
    description?: string;
    /** 是否粘性定位 */
    sticky?: boolean;
    /** 最小高度 */
    minHeight?: string;
    /** 额外的CSS类 */
    class?: string;
  }

  const props = withDefaults(defineProps<Props>(), {
    description: '',
    sticky: false,
    minHeight: '500px'
  });
</script>

<template>
  <section
    :class="[
      'bg-white rounded-xl shadow-md p-6 h-fit slide-up',
      props.sticky && 'lg:sticky lg:top-8',
      props.class
    ]"
    :style="{ minHeight: props.minHeight }"
  >
    <div class="mb-6 pb-4 border-b border-gray-200">
      <h2 class="text-xl font-semibold text-gray-800 mb-2">{{ title }}</h2>
      <p v-if="description" class="text-sm text-gray-600 leading-relaxed">
        {{ description }}
      </p>
    </div>

    <!-- 插槽内容 -->
    <slot />
  </section>
</template>

<style scoped>
/* 自定义动画 */
.slide-up {
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
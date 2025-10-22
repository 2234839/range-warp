<script setup lang="ts">
  import { ref } from 'vue';
  import RangeWrap from './components/RangeWrap.vue';
  import RangeForm from './components/RangeForm.vue';
  import AppCard from './components/AppCard.vue';

  /** RangeWrap 组件引用 */
  const rangeWrapRef = ref();

  /** 当前选中的文本范围 */
  const selectedRange = ref({
    start: 0,
    end: 0,
  });

  /** 处理编辑器选择变化 */
  const handleSelectionChange = (start: number, end: number) => {
    selectedRange.value = { start, end };
  };

  /** 处理表单确认操作 */
  const handleFormConfirm = (start: number, end: number, format: string) => {
    if (rangeWrapRef.value) {
      rangeWrapRef.value.applyTextFormat(start, end, format);
    }
  };

  /** 处理表单取消操作 */
  const handleFormCancel = () => {
    console.log('操作取消');
  };
</script>

<template>
  <div class="min-h-screen flex flex-col bg-gray-50">
    <!-- 主要内容区域 -->
    <main class="flex-1 py-3 px-4">
      <div class="max-w-7xl mx-auto">
        <div class="flex gap-1">
          <!-- 左侧：富文本编辑器 -->

          <RangeWrap
            ref="rangeWrapRef"
            @selection-change="handleSelectionChange"
            @format-apply="
              (start, end, format) => console.log(`应用格式 ${format} 到位置 ${start}-${end}`)
            " />

          <!-- 右侧：范围操作表单 -->

          <RangeForm
            :start="selectedRange.start"
            :end="selectedRange.end"
            @confirm="handleFormConfirm"
            @cancel="handleFormCancel" />
        </div>
      </div>
    </main>

    <!-- 底部 -->
    <footer class="bg-gray-800 text-white py-6 px-4 mt-auto">
      <div class="max-w-6xl mx-auto text-center">
        <p class="mb-4">
          <router-link
            to="/demo"
            class="inline-flex items-center gap-2 text-blue-400 no-underline py-2 px-4 border border-blue-400 rounded-lg transition-all duration-300 bg-blue-400/10 hover:bg-blue-400 hover:text-white hover:-translate-y-0.5 hover:shadow-lg">
            📦 查看组件库演示
          </router-link>
        </p>
        <p class="text-sm opacity-80">
          RangeWrap © 2024 |
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener"
            class="text-blue-400 hover:text-blue-300 transition-colors">
            GitHub
          </a>
        </p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
  /* 滚动条样式 */
  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: #f3f4f6;
  }

  ::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 9999px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #9ca3af;
  }
</style>

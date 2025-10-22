<script setup lang="ts">
import { ref } from 'vue'
import RangeWrap from './components/RangeWrap.vue'
import RangeForm from './components/RangeForm.vue'

/** RangeWrap 组件引用 */
const rangeWrapRef = ref()

/** 当前选中的文本范围 */
const selectedRange = ref({
  start: 0,
  end: 0
})

/** 处理编辑器选择变化 */
const handleSelectionChange = (start: number, end: number) => {
  selectedRange.value = { start, end }
}

/** 处理表单确认操作 */
const handleFormConfirm = (start: number, end: number, format: string) => {
  if (rangeWrapRef.value) {
    rangeWrapRef.value.applyTextFormat(start, end, format)
  }
}

/** 处理表单取消操作 */
const handleFormCancel = () => {
  console.log('操作取消')
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-gray-50">
    <!-- 头部 -->
    <header class="bg-gradient-primary text-white py-8 px-4 text-center shadow-lg">
      <h1 class="text-4xl font-bold mb-2 drop-shadow-lg">
        RangeWrap 调试页面
      </h1>
      <p class="text-lg opacity-90 max-w-2xl mx-auto">
        富文本编辑器调试工具 - 支持选中文本格式化和基于位置的精确文本操作
      </p>
    </header>

    <!-- 主要内容区域 -->
    <main class="flex-1 py-8 px-4">
      <div class="max-w-7xl mx-auto">
        <div class="grid lg:grid-cols-[1fr,320px] gap-8">
          <!-- 左侧：富文本编辑器 -->
          <section class="bg-white rounded-xl shadow-md p-6 min-h-[500px] slide-up">
            <div class="mb-6 pb-4 border-b border-gray-200">
              <h2 class="text-xl font-semibold text-gray-800 mb-2">
                富文本编辑器
              </h2>
              <p class="text-sm text-gray-600 leading-relaxed">
                选择文本后，右侧表单会自动更新位置范围
              </p>
            </div>
            <RangeWrap
              ref="rangeWrapRef"
              @selection-change="handleSelectionChange"
              @format-apply="(start, end, format) => console.log(`应用格式 ${format} 到位置 ${start}-${end}`)"
            />
          </section>

          <!-- 右侧：范围操作表单 -->
          <section class="bg-white rounded-xl shadow-md p-6 h-fit lg:sticky lg:top-8 slide-up">
            <div class="mb-6 pb-4 border-b border-gray-200">
              <h2 class="text-xl font-semibold text-gray-800 mb-2">
                范围操作表单
              </h2>
              <p class="text-sm text-gray-600 leading-relaxed">
                精确控制文本位置和格式操作
              </p>
            </div>
            <RangeForm
              :start="selectedRange.start"
              :end="selectedRange.end"
              @confirm="handleFormConfirm"
              @cancel="handleFormCancel"
            />
          </section>
        </div>
      </div>
    </main>

    <!-- 底部 -->
    <footer class="bg-gray-800 text-white py-6 px-4 mt-auto">
      <div class="max-w-6xl mx-auto text-center">
        <p class="mb-4">
          <router-link
            to="/demo"
            class="inline-flex items-center gap-2 text-blue-400 no-underline py-2 px-4 border border-blue-400 rounded-lg transition-all duration-300 bg-blue-400/10 hover:bg-blue-400 hover:text-white hover:-translate-y-0.5 hover:shadow-lg"
          >
            📦 查看组件库演示
          </router-link>
        </p>
        <p class="text-sm opacity-80">
          RangeWrap © 2024 |
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener"
            class="text-blue-400 hover:text-blue-300 transition-colors"
          >
            GitHub
          </a>
        </p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* 自定义动画和过渡效果 */
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

.slide-up {
  animation: slideUp 0.3s ease-out;
}

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

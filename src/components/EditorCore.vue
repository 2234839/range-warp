<script setup lang="ts">
  import { ref, onMounted, useTemplateRef } from 'vue';
  import { useEventListener } from '@vueuse/core';
  import { Editor, DOMRangeAdapter } from '../core/index';
  import type { Editor as EditorType } from '../core/index';
  import { EMPTY_FORMAT_STATE, STYLE_KEYS, getSelectionPosition } from './editor-utils';

  /** 组件属性 */
  interface Props {
    /** 初始 HTML 内容 */
    modelValue?: string;
    /** 当前用户名 */
    currentUser?: string;
  }

  const props = withDefaults(defineProps<Props>(), {
    modelValue: '',
    currentUser: 'anonymous',
  });

  /** 组件事件 */
  interface Emits {
    /** 内容变化事件 */
    'update:modelValue': [value: string];
    /** 选区变化事件 */
    selectionChange: [start: number, end: number, text: string];
  }

  const emit = defineEmits<Emits>();

  /** 编辑器容器引用 */
  const editorContainer = useTemplateRef('editorContainer');

  /** Editor 实例 */
  const editor = ref<EditorType | null>(null);

  /** 当前选区 */
  const currentSelection = ref({
    start: 0,
    end: 0,
    text: '',
  });

  /** 持久化的选区信息 */
  const persistentSelection = ref<{
    start: number;
    end: number;
    text: string;
  } | null>(null);

  /** 格式状态 */
  const formatState = ref({ ...EMPTY_FORMAT_STATE });

  /**
   * 初始化编辑器
   */
  onMounted(() => {
    if (!editorContainer.value) return;

    const adapter = new DOMRangeAdapter({
      container: editorContainer.value,
    });

    editor.value = new Editor({
      adapter,
      currentUser: props.currentUser,
    });

    // 设置初始内容
    if (props.modelValue) {
      editor.value.setHTML(props.modelValue);
    }

    // 监听选区变化
    useEventListener(document, 'selectionchange', handleSelectionChange);
  });

  /**
   * 处理选区变化 - 只更新持久化选区
   */
  function handleSelectionChange() {
    if (!editorContainer.value) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.getRangeAt(0).collapsed) return;

    const range = selection.getRangeAt(0);
    if (!editorContainer.value.contains(range.commonAncestorContainer)) return;

    const pos = getSelectionPosition(editorContainer.value);
    if (!pos) return;

    const text = range.toString();
    persistentSelection.value = { start: pos.start, end: pos.end, text };
    currentSelection.value = { start: pos.start, end: pos.end, text };

    /* 使用 CSS Custom Highlight API 高亮选区 */
    if (CSS.highlights) {
      CSS.highlights.set('editor-selection', new Highlight(range.cloneRange()));
    }

    updateFormatState();
    emit('selectionChange', pos.start, pos.end, text);
  }

  /**
   * 处理输入事件
   */
  function handleInput() {
    emit('update:modelValue', getHTML());
  }

  /**
   * 更新格式状态 - 使用编辑器 API
   */
  function updateFormatState() {
    if (!editor.value) return;

    const { start, end } = currentSelection.value;
    if (start === end) {
      formatState.value = { ...EMPTY_FORMAT_STATE };
      return;
    }

    formatState.value = editor.value.getFormatState(start, end);
  }

  /**
   * 应用样式
   */
  function applyStyle(style: string) {
    if (!editor.value) return;

    const { start, end } = currentSelection.value;
    if (start === end) return;

    editor.value.applyStyle(start, end, style);

    emit('update:modelValue', getHTML());
    setTimeout(updateFormatState, 0);
  }

  /**
   * 移除样式
   */
  function removeStyle(style: string) {
    if (!editor.value) return;

    const { start, end } = currentSelection.value;
    if (start === end) return;

    editor.value.removeStyle(start, end, style);

    emit('update:modelValue', getHTML());
    setTimeout(updateFormatState, 0);
  }

  /**
   * 切换样式（根据当前状态决定应用或移除）
   */
  function toggleStyle(style: string) {
    const styleKey = STYLE_KEYS[style];
    if (!styleKey) return;

    if (formatState.value[styleKey]) {
      removeStyle(style);
    } else {
      applyStyle(style);
    }

    /* 样式操作后，恢复编辑器焦点并尝试恢复选区 */
    if (editorContainer.value) {
      editorContainer.value.focus();
      if (persistentSelection.value) {
        restoreNativeSelection();
      }
    }
  }

  /**
   * 根据持久化选区恢复原生选区
   */
  function restoreNativeSelection() {
    if (!editorContainer.value || !persistentSelection.value || !editor.value) return;

    editor.value.createRange(persistentSelection.value.start, persistentSelection.value.end).select();
  }

  /**
   * 获取 HTML 内容
   */
  function getHTML(): string {
    return editor.value?.getHTML() || '';
  }

  /**
   * 设置 HTML 内容
   */
  function setHTML(html: string) {
    if (!editor.value) return;
    editor.value.setHTML(html);
  }

  /**
   * 暴露给父组件的方法和属性
   */
  defineExpose({
    /** Editor 实例 */
    editor,
    /** 应用样式 */
    applyStyle,
    /** 移除样式 */
    removeStyle,
    /** 获取 HTML */
    getHTML,
    /** 设置 HTML */
    setHTML,
    /** 当前选区 */
    currentSelection,
    /** 格式状态 */
    formatState,
  });
</script>

<template>
  <div class="border border-gray-300 rounded-lg overflow-hidden font-sans bg-white shadow-sm">
    <!-- 工具栏 -->
    <div class="flex items-center p-2 bg-gray-50 border-b border-gray-200 gap-1">
      <!-- 格式化按钮组 -->
      <button
        @click="toggleStyle('bold')"
        :class="[
          'p-2 border rounded text-sm font-bold min-w-[32px] h-8 flex items-center justify-center transition-all duration-200',
          formatState.bold
            ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400',
        ]"
        title="加粗">
        <strong>B</strong>
      </button>

      <button
        @click="toggleStyle('italic')"
        :class="[
          'p-2 border rounded text-sm italic min-w-[32px] h-8 flex items-center justify-center transition-all duration-200',
          formatState.italic
            ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400',
        ]"
        title="斜体">
        <em>I</em>
      </button>

      <button
        @click="toggleStyle('underline')"
        :class="[
          'p-2 border rounded text-sm underline min-w-[32px] h-8 flex items-center justify-center transition-all duration-200',
          formatState.underline
            ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400',
        ]"
        title="下划线">
        <u>U</u>
      </button>

      <button
        @click="toggleStyle('strikethrough')"
        :class="[
          'p-2 border rounded text-sm line-through min-w-[32px] h-8 flex items-center justify-center transition-all duration-200',
          formatState.strikethrough
            ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400',
        ]"
        title="删除线">
        <s>S</s>
      </button>

      <!-- 分隔线 -->
      <div class="w-px h-6 bg-gray-300 mx-1"></div>

      <!-- 高亮按钮 -->
      <button
        @click="toggleStyle('highlight')"
        :class="[
          'p-2 border rounded text-sm min-w-[32px] h-8 flex items-center justify-center transition-all duration-200',
          formatState.highlight
            ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400',
        ]"
        title="高亮">
        <span class="px-1 bg-yellow-200 rounded text-xs font-bold">H</span>
      </button>
    </div>

    <!-- 编辑区域 -->
    <div
      ref="editorContainer"
      contenteditable="true"
      class="p-4 min-h-[300px] outline-none leading-relaxed text-sm whitespace-pre-wrap break-words focus:bg-gray-50/50"
      @input="handleInput">
      <slot></slot>
    </div>

    <!-- 状态栏 - 始终显示 -->
    <div class="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
      <span v-if="currentSelection.start !== currentSelection.end">
        选中: "{{ currentSelection.text }}" ({{ currentSelection.start }}-{{ currentSelection.end }})
      </span>
      <span v-else>请选择文本进行操作</span>
    </div>
  </div>
</template>

<style scoped>
/* 焦点样式 */
[contenteditable]:focus {
  outline: none;
}

button:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

/* 选区高亮样式 - 使用 CSS Custom Highlight API */
::highlight(editor-selection) {
  background-color: rgba(59, 130, 246, 0.2);
  border-bottom: 2px solid #3b82f6;
}
</style>

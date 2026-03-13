<script setup lang="ts">
  import { ref, computed, onMounted, onBeforeUnmount, useTemplateRef } from 'vue';
  import { useDebounceFn } from '@vueuse/core';
  import { EMPTY_FORMAT_STATE, STYLE_KEYS, getSelectionPosition, getFormattingAncestors, wrapWithMissingFormatting, TOOLBAR_BUTTONS, type FormatState, type EditorComposable } from './editor-utils';
  import { useUEditorPlus } from './useUEditorPlus';
  import { useNativeEditor } from './useNativeEditor';
  import { getNonCopyableSelector } from '../core/adapters/DOMRangeAdapter';


  /** 组件属性 */
  interface Props {
    /** 初始 HTML 内容 */
    modelValue?: string;
    /** 当前用户名 */
    currentUser?: string;
    /** 编辑器模式 */
    mode?: 'native' | 'ueditor-plus';
  }

  const props = withDefaults(defineProps<Props>(), {
    modelValue: '',
    currentUser: 'anonymous',
    mode: 'native',
  });

  /** 组件事件 */
  interface Emits {
    /** 内容变化事件 */
    'update:modelValue': [value: string];
    /** 模式变化事件 */
    'update:mode': [value: 'native' | 'ueditor-plus'];
    /** 选区变化事件 */
    selectionChange: [start: number, end: number, text: string];
  }

  const emit = defineEmits<Emits>();

  /** 切换编辑器模式 */
  function toggleMode() {
    const newMode = isUEditorMode.value ? 'native' : 'ueditor-plus';
    emit('update:mode', newMode);
  }

  /** 模式切换前保存当前内容 */
  function saveContentBeforeSwitch() {
    emit('update:modelValue', active.value.getHTML());
  }

  /** 原生编辑器容器引用 */
  const editorContainer = useTemplateRef('editorContainer');

  /** UEditor Plus 容器引用 */
  const ueContainerRef = useTemplateRef<HTMLDivElement>('ueContainerRef');

  /** 当前选区 */
  const currentSelection = ref({ start: 0, end: 0, text: '' });

  /** 编辑器是否拥有焦点 */
  const isEditorFocused = ref(false);

  /** 格式状态 */
  const formatState = ref<FormatState>(EMPTY_FORMAT_STATE);

  /** 是否为 UEditor Plus 模式 */
  const isUEditorMode = computed(() => props.mode === 'ueditor-plus');

  /** 原生编辑器 composable */
  const native = useNativeEditor({
    containerRef: editorContainer,
    currentUser: props.currentUser,
    onInput: handleInput,
    onFocus: () => {
      isEditorFocused.value = true;
      syncSelectionFromDOM();
    },
    onBlur: () => { isEditorFocused.value = false; },
    onSelectionChange: handleSelectionChange,
    onCopyCut: handleCopyCut,
  });

  /** UEditor Plus composable */
  const ue = useUEditorPlus({
    containerRef: ueContainerRef,
    currentUser: props.currentUser,
    onContentChange: (html) => emit('update:modelValue', html),
    onFocus: () => {
      isEditorFocused.value = true;
      syncSelectionFromDOM();
    },
    onBlur: () => { isEditorFocused.value = false; },
    onSelectionChange: handleSelectionChange,
    onCopyCut: handleCopyCut,
  });

  /**
   * 当前活跃的编辑器 composable（统一入口，消除业务逻辑中的模式分支）
   */
  const active = computed<EditorComposable>(() => isUEditorMode.value ? ue : native);

  /** 当前活跃的 Editor 实例 */
  const activeEditor = computed(() => active.value.editor.value);

  onMounted(() => {
    if (isUEditorMode.value) {
      ue.init(props.modelValue);
    } else {
      native.init(props.modelValue);
    }
  });

  onBeforeUnmount(() => {
    native.destroy();
    ue.destroy();
  });

  /**
   * 从 DOM 中同步选区状态
   */
  function syncSelectionFromDOM() {
    const { ownerWindow, container } = active.value.selectionContext.value;
    if (!container) return;

    const selection = ownerWindow.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    /* 编辑器内选区折叠 → 清除选区 */
    if (range.collapsed) {
      currentSelection.value = { start: 0, end: 0, text: '' };
      CSS.highlights?.delete('editor-selection');
      formatState.value = EMPTY_FORMAT_STATE;
      emit('selectionChange', 0, 0, '');
      return;
    }

    /* 编辑器内非折叠选区 → 更新选区 */
    const pos = getSelectionPosition(container, ownerWindow);
    if (!pos) return;

    const text = range.toString();
    const selectionState = { start: pos.start, end: pos.end, text };
    currentSelection.value = selectionState;

    /**
     * CSS Custom Highlight API 跨 iframe 不工作
     * UEditor Plus 模式下跳过高亮，仅更新数据
     */
    if (!isUEditorMode.value && CSS.highlights) {
      CSS.highlights.set('editor-selection', new Highlight(range.cloneRange()));
    }

    updateFormatState();
    emit('selectionChange', pos.start, pos.end, text);
  }

  /**
   * 处理选区变化
   */
  function handleSelectionChange() {
    if (!isEditorFocused.value) return;
    syncSelectionFromDOM();
  }

  /** 防抖修复跨块容器的非连续分片 */
  const debouncedRepair = useDebounceFn(() => {
    activeEditor.value?.repairSplitContainers();
  }, 300);

  /**
   * 处理输入事件（仅原生模式通过 @input 触发，UEditor 通过 contentchange 事件触发）
   */
  function handleInput() {
    emit('update:modelValue', active.value.getHTML());
    debouncedRepair();
  }

  /**
   * 拦截复制/剪切事件，清洗剪贴板 HTML
   *
   * 1. 从选区提取 HTML 片段
   * 2. 清洗不可复制容器（书签、修订等），保留文本和内联样式
   * 3. 恢复 cloneContents 丢失的格式化祖先上下文（如 em、strong）
   * 4. 写入剪贴板
   *
   * 参考 ProseMirror / Quill / Slate 等主流编辑器均始终拦截复制事件，
   * 通过 clipboardData.setData 写入清洗后的 HTML，不放行给浏览器原生处理
   */
  function handleCopyCut(event: ClipboardEvent) {
    if (!activeEditor.value) return;

    const { ownerWindow, container } = active.value.selectionContext.value;
    const selection = ownerWindow.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!container?.contains(range.commonAncestorContainer)) return;

    event.preventDefault();

    /** 从选区提取 HTML 片段 */
    const fragment = range.cloneContents();
    const wrapper = ownerWindow.document.createElement('div');
    wrapper.appendChild(fragment);

    /** 清洗不可复制容器，保留文本和内联样式 */
    let html = activeEditor.value.sanitizeHTML(wrapper.innerHTML);

    /** 恢复 cloneContents 丢失的格式化祖先（加粗、斜体等） */
    const nonCopyableSelector = getNonCopyableSelector();
    const ancestors = getFormattingAncestors(range, container, nonCopyableSelector);
    if (ancestors.length > 0) {
      html = wrapWithMissingFormatting(html, ancestors);
    }

    event.clipboardData?.setData('text/html', html);
    event.clipboardData?.setData('text/plain', selection.toString());

    /** 剪切时删除选区内容 */
    if (event.type === 'cut') {
      range.deleteContents();
      emit('update:modelValue', active.value.getHTML());
      activeEditor.value.repairSplitContainers();
    }
  }

  /**
   * 更新格式状态
   */
  function updateFormatState() {
    const ed = activeEditor.value;
    if (!ed) return;

    const { start, end } = currentSelection.value;
    if (start === end) {
      formatState.value = EMPTY_FORMAT_STATE;
      return;
    }

    formatState.value = ed.getFormatState(start, end);
  }

  /**
   * 应用或移除样式
   */
  function setStyle(style: string, apply: boolean) {
    const ed = activeEditor.value;
    if (!ed) return;

    const { start, end } = currentSelection.value;
    if (start === end) return;

    if (apply) {
      ed.applyStyle(start, end, style);
    } else {
      ed.removeStyle(start, end, style);
    }

    emit('update:modelValue', active.value.getHTML());
    requestAnimationFrame(updateFormatState);
  }

  /**
   * 切换样式
   */
  function toggleStyle(style: string) {
    const styleKey = STYLE_KEYS[style];
    if (!styleKey) return;

    setStyle(style, !formatState.value[styleKey]);

    /* 样式操作后，恢复编辑器焦点并尝试恢复选区
     * 在 focus() 前保存位置，因为 focus() 可能同步触发 onFocus → syncSelectionFromDOM，
     * 后者在原生选区已折叠时会清空 currentSelection */
    const { container } = active.value.selectionContext.value;
    if (container) {
      const { start, end } = currentSelection.value;
      container.focus();
      if (start !== end) {
        restoreNativeSelection(start, end);
      }
    }
  }

  /**
   * 恢复原生选区
   *
   * @param start 起始位置（若不传则从 currentSelection 读取）
   * @param end 结束位置（若不传则从 currentSelection 读取）
   */
  function restoreNativeSelection(start?: number, end?: number) {
    const ed = activeEditor.value;
    const { container } = active.value.selectionContext.value;
    if (!container || !ed) return;

    const s = start ?? currentSelection.value.start;
    const e = end ?? currentSelection.value.end;
    if (s === e) return;

    ed.createRange(s, e).select();
  }

  /**
   * 暴露给父组件的方法和属性
   */
  defineExpose({
    editor: activeEditor,
    setStyle,
    toggleStyle,
    getHTML: () => active.value.getHTML(),
    setHTML: (html: string) => active.value.setHTML(html),
    currentSelection,
    formatState,
    /** 当前编辑器容器（contenteditable div 或 iframe body） */
    container: computed(() => active.value.selectionContext.value.container),
    /** 当前编辑器是否就绪 */
    ready: computed(() => active.value.ready.value),
  });
</script>

<template>
  <div class="flex-1 min-w-0 border border-gray-300 rounded-lg overflow-hidden font-sans bg-white shadow-sm">
    <!-- 工具栏（始终显示，基于适配器操作） -->
    <div @mousedown.stop.prevent class="flex items-center p-2 bg-gray-50 border-b border-gray-200 gap-1">
      <!-- 模式切换按钮 -->
      <button
        @click="saveContentBeforeSwitch(); toggleMode()"
        :class="[
          'px-2 h-8 border rounded text-xs flex items-center justify-center transition-all duration-200 whitespace-nowrap',
          isUEditorMode
            ? 'bg-purple-500 text-white border-purple-600 hover:bg-purple-600'
            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400',
        ]"
        :title="isUEditorMode ? '当前: UEditor Plus，点击切换' : '当前: 原生，点击切换'">
        {{ isUEditorMode ? 'UE' : '原生' }}
      </button>

      <div class="w-px h-6 bg-gray-300 mx-1"></div>

      <template v-for="btn in TOOLBAR_BUTTONS" :key="btn.style">
        <div v-if="btn.divider" class="w-px h-6 bg-gray-300 mx-1"></div>
        <button
          @click="toggleStyle(btn.style)"
          :class="[
            'p-2 border rounded text-sm min-w-8 h-8 flex items-center justify-center transition-all duration-200',
            btn.iconClass,
            formatState[STYLE_KEYS[btn.style]]
              ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400',
          ]"
          :title="btn.title">
          <component :is="btn.wrapTag" v-if="btn.wrapTag">{{ btn.label }}</component>
          <span v-else class="px-1 bg-yellow-200 rounded text-xs font-bold">{{ btn.label }}</span>
        </button>
      </template>
    </div>

    <!-- 原生编辑区域 -->
    <div
      v-if="!isUEditorMode"
      ref="editorContainer"
      contenteditable="true"
      class="p-4 min-h-[300px] outline-none leading-relaxed text-sm whitespace-pre-wrap break-words focus:bg-gray-50/50"
      @input="handleInput">
      <slot></slot>
    </div>

    <!-- UEditor Plus 容器 -->
    <div v-else ref="ueContainerRef" class="ue-wrapper">
      <div v-if="ue.loading.value" class="flex items-center justify-center h-48 text-sm text-gray-500">
        正在加载 UEditor Plus...
      </div>
      <div v-else-if="ue.error.value" class="flex items-center justify-center h-48 text-sm text-red-500">
        UEditor Plus 加载失败
      </div>
    </div>

    <!-- 状态栏 -->
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

/* UEditor Plus 样式 */
.ue-wrapper {
  min-height: 300px;
}
:deep(.edui-default .edui-editor) {
  border: none !important;
}
:deep(.edui-editor-iframeholder) {
  min-height: 300px !important;
}
/* 隐藏 UEditor 自带的工具栏（我们使用基于适配器的工具栏） */
:deep(.edui-default .edui-editor-toolbarbox) {
  display: none !important;
}
</style>

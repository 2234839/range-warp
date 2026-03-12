<script setup lang="ts">
  import { ref, computed, onMounted, onBeforeUnmount, useTemplateRef, type ComputedRef } from 'vue';
  import { useDebounceFn } from '@vueuse/core';
  import type { Editor as EditorType } from '../core/index';
  import { EMPTY_FORMAT_STATE, STYLE_KEYS, getSelectionPosition } from './editor-utils';
  import { useUEditorPlus } from './useUEditorPlus';
  import { useNativeEditor } from './useNativeEditor';

  /** 重置格式状态时复用同一个对象（避免每次 spread 创建新对象） */
  const CLEARED_FORMAT_STATE = { ...EMPTY_FORMAT_STATE };

  /** 工具栏按钮配置 */
  interface ToolbarButtonConfig {
    /** 样式名称 */
    style: string;
    /** 按钮标题 */
    title: string;
    /** 按钮显示的图标标签，如 'B'、'I' */
    label: string;
    /** 图标额外 CSS 类（如 font-bold、italic） */
    iconClass: string;
    /** 是否使用包裹标签（如 strong、em、u、s） */
    wrapTag?: string;
    /** 分隔线（在此按钮前插入分隔线） */
    divider?: boolean;
  }

  /** 工具栏按钮列表 */
  const toolbarButtons: ToolbarButtonConfig[] = [
    { style: 'bold', title: '加粗', label: 'B', iconClass: 'font-bold', wrapTag: 'strong' },
    { style: 'italic', title: '斜体', label: 'I', iconClass: 'italic', wrapTag: 'em' },
    { style: 'underline', title: '下划线', label: 'U', iconClass: 'underline', wrapTag: 'u' },
    { style: 'strikethrough', title: '删除线', label: 'S', iconClass: 'line-through', wrapTag: 's' },
    { style: 'highlight', title: '高亮', label: 'H', iconClass: '', divider: true },
  ];

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
    emit('update:modelValue', getHTML());
  }

  /** 原生编辑器容器引用 */
  const editorContainer = useTemplateRef('editorContainer');

  /** UEditor Plus 容器引用 */
  const ueContainerRef = useTemplateRef<HTMLDivElement>('ueContainerRef');

  /** 当前选区 */
  const currentSelection = ref({ start: 0, end: 0, text: '' });

  /** 持久化的选区信息 */
  const persistentSelection = ref<{
    start: number;
    end: number;
    text: string;
  } | null>(null);

  /** 编辑器是否拥有焦点 */
  const isEditorFocused = ref(false);

  /** 格式状态 */
  const formatState = ref({ ...EMPTY_FORMAT_STATE });

  /** 是否为 UEditor Plus 模式 */
  const isUEditorMode = computed(() => props.mode === 'ueditor-plus');

  /**
   * 选区上下文：抽象出当前模式的 window 和 container，
   * 使 syncSelectionFromDOM / handleCopyCut 等方法同时支持原生和 iframe
   */
  const selectionContext = ref<{
    ownerWindow: Window;
    container: HTMLElement | null;
  }>({ ownerWindow: window, container: null });

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
   * 当前活跃的 Editor 实例
   *
   * 原生模式使用 native editor ref，UE 模式使用 ue editor ref
   */
  const activeEditor = computed(() => {
    return isUEditorMode.value ? ue.editor.value : native.editor.value;
  }) as ComputedRef<EditorType | null>;

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
   * 从 DOM 中同步选区状态到持久化选区
   */
  function syncSelectionFromDOM() {
    /** UE 模式下同步 composable 的 selectionContext */
    if (isUEditorMode.value) {
      selectionContext.value = ue.selectionContext.value;
    }

    const { ownerWindow, container } = selectionContext.value;
    if (!container) return;

    const selection = ownerWindow.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    /* 编辑器内选区折叠 → 清除持久化选区 */
    if (range.collapsed) {
      persistentSelection.value = null;
      currentSelection.value = { start: 0, end: 0, text: '' };
      CSS.highlights?.delete('editor-selection');
      formatState.value = CLEARED_FORMAT_STATE;
      emit('selectionChange', 0, 0, '');
      return;
    }

    /* 编辑器内非折叠选区 → 更新持久化选区 */
    const pos = getSelectionPosition(container, ownerWindow);
    if (!pos) return;

    const text = range.toString();
    const selectionState = { start: pos.start, end: pos.end, text };
    persistentSelection.value = selectionState;
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
    emit('update:modelValue', getHTML());
    debouncedRepair();
  }

  /**
   * 拦截复制/剪切事件，清洗剪贴板 HTML
   */
  function handleCopyCut(event: ClipboardEvent) {
    if (!activeEditor.value) return;

    const { ownerWindow, container } = selectionContext.value;
    const selection = ownerWindow.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!container?.contains(range.commonAncestorContainer)) return;

    event.preventDefault();

    const fragment = range.cloneContents();
    const wrapper = ownerWindow.document.createElement('div');
    wrapper.appendChild(fragment);

    /** 清洗不可复制容器，保留文本和内联样式 */
    const html = activeEditor.value.sanitizeHTML(wrapper.innerHTML);

    event.clipboardData?.setData('text/html', html);
    event.clipboardData?.setData('text/plain', selection.toString());

    /** 剪切时删除选区内容 */
    if (event.type === 'cut') {
      range.deleteContents();
      emit('update:modelValue', getHTML());
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
      formatState.value = CLEARED_FORMAT_STATE;
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

    emit('update:modelValue', getHTML());
    requestAnimationFrame(updateFormatState);
  }

  /**
   * 切换样式
   */
  function toggleStyle(style: string) {
    const styleKey = STYLE_KEYS[style];
    if (!styleKey) return;

    setStyle(style, !formatState.value[styleKey]);

    /* 样式操作后，恢复编辑器焦点并尝试恢复选区 */
    const { container } = selectionContext.value;
    if (container) {
      container.focus();
      if (persistentSelection.value) {
        restoreNativeSelection();
      }
    }
  }

  /**
   * 根据持久化选区恢复原生选区
   */
  function restoreNativeSelection() {
    const ed = activeEditor.value;
    const { container } = selectionContext.value;
    if (!container || !persistentSelection.value || !ed) return;

    ed.createRange(persistentSelection.value.start, persistentSelection.value.end).select();
  }

  /**
   * 获取 HTML 内容
   */
  function getHTML(): string {
    if (isUEditorMode.value) {
      return ue.getHTML();
    }
    return native.getHTML();
  }

  /**
   * 设置 HTML 内容
   */
  function setHTML(html: string) {
    if (isUEditorMode.value) {
      ue.setHTML(html);
      return;
    }
    native.setHTML(html);
  }

  /**
   * 暴露给父组件的方法和属性
   */
  defineExpose({
    editor: activeEditor,
    setStyle,
    toggleStyle,
    getHTML,
    setHTML,
    persistentSelection,
    currentSelection,
    formatState,
    /** 当前编辑器容器（contenteditable div 或 iframe body） */
    container: computed(() => selectionContext.value.container),
    /** UEditor Plus 是否就绪 */
    ready: ue.ready,
  });
</script>

<template>
  <div class="flex-1 min-w-0 border border-gray-300 rounded-lg overflow-hidden font-sans bg-white shadow-sm">
    <!-- 工具栏（始终显示，基于适配器操作） -->
    <div @mousedown.prevent class="flex items-center p-2 bg-gray-50 border-b border-gray-200 gap-1">
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

      <template v-for="btn in toolbarButtons" :key="btn.style">
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

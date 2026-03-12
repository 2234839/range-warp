<script setup lang="ts">
  import { ref, onMounted, useTemplateRef } from 'vue';
  import { useEventListener, useDebounceFn } from '@vueuse/core';
  import { Editor, DOMRangeAdapter, BLOCK_TAG_NAMES, getNonCopyableSelector } from '../core/index';
  import type { Editor as EditorType } from '../core/index';
  import { EMPTY_FORMAT_STATE, STYLE_KEYS, getSelectionPosition } from './editor-utils';

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

  /** 编辑器是否拥有焦点 */
  const isEditorFocused = ref(false);

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

    // 监听编辑器焦点，控制持久化选区行为
    useEventListener(editorContainer.value, 'focus', () => {
      isEditorFocused.value = true;
      /* 聚焦时同步选区状态（selectionchange 可能先于 focus 触发） */
      syncSelectionFromDOM();
    });
    useEventListener(editorContainer.value, 'blur', () => { isEditorFocused.value = false; });

    // 监听选区变化
    useEventListener(document, 'selectionchange', handleSelectionChange);

    // 监听复制/剪切事件，清洗剪贴板中的不可复制容器
    useEventListener(editorContainer.value, 'copy', handleCopyCut);
    useEventListener(editorContainer.value, 'cut', handleCopyCut);
  });

  /**
   * 从 DOM 中同步选区状态到持久化选区
   *
   * 持久化选区规则：
   * - 编辑器内选区折叠（光标点击）→ 清除持久化选区
   * - 编辑器内非折叠选区 → 更新持久化选区
   * - 选区不在编辑器内 → 不处理
   */
  function syncSelectionFromDOM() {
    if (!editorContainer.value) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!editorContainer.value.contains(range.commonAncestorContainer)) return;

    /* 编辑器内选区折叠（光标点击）→ 清除持久化选区 */
    if (range.collapsed) {
      persistentSelection.value = null;
      currentSelection.value = { start: 0, end: 0, text: '' };
      CSS.highlights?.delete('editor-selection');
      formatState.value = { ...EMPTY_FORMAT_STATE };
      emit('selectionChange', 0, 0, '');
      return;
    }

    /* 编辑器内非折叠选区 → 更新持久化选区 */
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
   * 处理选区变化
   *
   * 仅在编辑器拥有焦点时处理选区变化，
   * 编辑器失焦时忽略所有选区变化以保持持久化选区。
   */
  function handleSelectionChange() {
    if (!isEditorFocused.value) return;
    syncSelectionFromDOM();
  }

  /** 防抖修复跨块容器的非连续分片（避免每次按键都执行 DOM 遍历） */
  const debouncedRepair = useDebounceFn(() => {
    editor.value?.repairSplitContainers();
  }, 300);

  /**
   * 处理输入事件
   */
  function handleInput() {
    emit('update:modelValue', getHTML());
    debouncedRepair();
  }

  /** 不可复制容器的 CSS 选择器 */
  const NON_COPYABLE_SELECTOR = getNonCopyableSelector();

  /**
   * 拦截复制/剪切事件，清洗剪贴板 HTML
   *
   * 1. 从选区提取 HTML 片段
   * 2. 清洗不可复制容器（书签、修订等），保留文本和内联样式
   * 3. 补回 range.cloneContents() 丢失的祖先格式化元素（如 em、strong）
   * 4. 写入剪贴板
   */
  function handleCopyCut(event: ClipboardEvent) {
    if (!editor.value) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!editorContainer.value?.contains(range.commonAncestorContainer)) return;

    event.preventDefault();

    const fragment = range.cloneContents();
    const wrapper = document.createElement('div');
    wrapper.appendChild(fragment);

    /** 清洗不可复制容器 */
    const sanitizedHTML = editor.value.sanitizeHTML(wrapper.innerHTML);

    /** 补回 cloneContents 丢失的格式化祖先上下文 */
    const ancestors = getFormattingAncestors(range, editorContainer.value);
    const html = wrapWithFormatting(sanitizedHTML, ancestors);

    event.clipboardData?.setData('text/html', html);
    event.clipboardData?.setData('text/plain', selection.toString());

    /** 剪切时删除选区内容 */
    if (event.type === 'cut') {
      range.deleteContents();
      emit('update:modelValue', getHTML());
      editor.value.repairSplitContainers();
    }
  }

  /**
   * 获取选区的格式化祖先元素（从内到外）
   *
   * 使用黑名单策略：保留所有内联祖先，只排除块级元素和不可复制的语义容器。
   * 这样任意富文本格式化元素（如自定义 span、font 等）都能被保留。
   */
  function getFormattingAncestors(range: Range, container: Element): Element[] {
    const common = range.commonAncestorContainer;
    let node: Node | null = common.nodeType === Node.ELEMENT_NODE ? common : common.parentElement;
    const ancestors: Element[] = [];

    while (node && node !== container) {
      if (node instanceof Element) {
        /* 块级元素终止祖先链（格式化上下文在块边界处断裂） */
        if (BLOCK_TAG_NAMES.has(node.tagName.toLowerCase())) break;
        /* 跳过不可复制的语义容器（书签、修订等），但继续向上查找 */
        if (NON_COPYABLE_SELECTOR && node.matches(NON_COPYABLE_SELECTOR)) {
          node = node.parentElement;
          continue;
        }
        ancestors.push(node);
      }
      node = node.parentElement;
    }

    return ancestors;
  }

  /**
   * 用格式化祖先包裹 HTML 字符串（从外到内逐层包裹）
   */
  function wrapWithFormatting(html: string, ancestors: Element[]): string {
    let result = html;
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const tag = ancestors[i].tagName.toLowerCase();
      result = `<${tag}>${result}</${tag}>`;
    }
    return result;
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
   * 应用或移除样式
   */
  function setStyle(style: string, apply: boolean) {
    if (!editor.value) return;

    const { start, end } = currentSelection.value;
    if (start === end) return;

    if (apply) {
      editor.value.applyStyle(start, end, style);
    } else {
      editor.value.removeStyle(start, end, style);
    }

    emit('update:modelValue', getHTML());
    requestAnimationFrame(updateFormatState);
  }

  /**
   * 切换样式（根据当前状态决定应用或移除）
   */
  function toggleStyle(style: string) {
    const styleKey = STYLE_KEYS[style];
    if (!styleKey) return;

    setStyle(style, !formatState.value[styleKey]);

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
    /** 应用或移除样式 */
    setStyle,
    /** 切换样式 */
    toggleStyle,
    /** 获取 HTML */
    getHTML,
    /** 设置 HTML */
    setHTML,
    /** 持久化选区（编辑器外部操作不影响，编辑器内光标折叠时清除） */
    persistentSelection,
    /** 当前选区（跟随浏览器 selection 实时变化） */
    currentSelection,
    /** 格式状态 */
    formatState,
  });
</script>

<template>
  <div class="flex-1 min-w-0 border border-gray-300 rounded-lg overflow-hidden font-sans bg-white shadow-sm">
    <!-- 工具栏 -->
    <div class="flex items-center p-2 bg-gray-50 border-b border-gray-200 gap-1">
      <template v-for="btn in toolbarButtons" :key="btn.style">
        <div v-if="btn.divider" class="w-px h-6 bg-gray-300 mx-1"></div>
        <button
          @click="toggleStyle(btn.style)"
          :class="[
            'p-2 border rounded text-sm min-w-[32px] h-8 flex items-center justify-center transition-all duration-200',
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

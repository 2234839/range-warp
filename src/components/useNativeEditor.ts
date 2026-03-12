/**
 * 原生 contenteditable 编辑器 composable
 *
 * 封装原生 contenteditable 的 adapter 初始化、事件监听等逻辑，
 * 与 useUEditorPlus 保持对称的接口设计
 */

import { ref } from 'vue';
import { useEventListener } from '@vueuse/core';
import { Editor, DOMRangeAdapter } from '../core/index';
import type { Editor as EditorType } from '../core/index';

/** 选区上下文（原生模式） */
interface SelectionContext {
  ownerWindow: Window;
  container: HTMLElement | null;
}

/** composable 参数 */
interface UseNativeEditorOptions {
  /** contenteditable 容器 ref */
  containerRef: { value: HTMLElement | null };
  /** 当前用户名 */
  currentUser: string;
  /** 内容变化回调 */
  onContentChange?: (html: string) => void;
  /** 编辑器获得焦点 */
  onFocus?: () => void;
  /** 编辑器失去焦点 */
  onBlur?: () => void;
  /** 选区变化 */
  onSelectionChange?: () => void;
  /** 复制/剪切事件 */
  onCopyCut?: (event: ClipboardEvent) => void;
  /** 输入事件 */
  onInput?: () => void;
}

/**
 * 原生 contenteditable 编辑器 composable
 *
 * 调用方在 onMounted 中调用 `init()` 初始化
 */
export function useNativeEditor(options: UseNativeEditorOptions) {
  const { containerRef, currentUser, onContentChange, onFocus, onBlur, onSelectionChange, onCopyCut, onInput } = options;

  const editor = ref<EditorType | null>(null);
  const selectionContext = ref<SelectionContext>({ ownerWindow: window, container: null });

  /** 获取 HTML 内容 */
  function getHTML(): string {
    return editor.value?.getHTML() || '';
  }

  /** 设置 HTML 内容 */
  function setHTML(html: string) {
    editor.value?.setHTML(html);
  }

  /**
   * 初始化原生 contenteditable 编辑器
   */
  function init(initialContent?: string) {
    const container = containerRef.value;
    if (!container) return;

    selectionContext.value = { ownerWindow: window, container };

    const adapter = new DOMRangeAdapter({ container });
    editor.value = new Editor({ adapter, currentUser });

    if (initialContent) {
      editor.value.setHTML(initialContent);
    }

    useEventListener(container, 'focus', onFocus);
    useEventListener(container, 'blur', onBlur);
    useEventListener(document, 'selectionchange', onSelectionChange);
    useEventListener(container, 'copy', onCopyCut);
    useEventListener(container, 'cut', onCopyCut);

    if (onInput) {
      useEventListener(container, 'input', onInput);
    }
  }

  /**
   * 销毁（原生模式无需特殊清理）
   */
  function destroy() {
    /* 原生 contenteditable 无需销毁，Vue 会处理 ref 清理 */
  }

  return {
    editor,
    selectionContext,
    init,
    destroy,
    getHTML,
    setHTML,
  };
}

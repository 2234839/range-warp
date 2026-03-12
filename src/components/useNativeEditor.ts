/**
 * 原生 contenteditable 编辑器 composable
 *
 * 封装原生 contenteditable 的 adapter 初始化、事件监听等逻辑，
 * 与 useUEditorPlus 保持对称的接口设计
 */

import { ref, shallowRef } from 'vue';
import { useEventListener } from '@vueuse/core';
import { Editor, DOMRangeAdapter } from '../core/index';
import type { Editor as EditorType } from '../core/index';
import type { BaseEditorOptions, EditorComposable, SelectionContext } from './editor-utils';

/** composable 参数（原生模式特有 onInput） */
interface UseNativeEditorOptions extends BaseEditorOptions {
  /** 输入事件 */
  onInput?: () => void;
}

/**
 * 原生 contenteditable 编辑器 composable
 *
 * 调用方在 onMounted 中调用 `init()` 初始化
 */
export function useNativeEditor(options: UseNativeEditorOptions): EditorComposable {
  const { containerRef, currentUser, onContentChange, onFocus, onBlur, onSelectionChange, onCopyCut, onInput } = options;

  const editor = shallowRef<EditorType | null>(null);
  const selectionContext = ref<SelectionContext>({ ownerWindow: window, container: null });
  /** 原生模式立即就绪，无需加载 */
  const loading = ref(false);
  const ready = ref(true);
  const error = ref(false);

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

    if (onFocus) useEventListener(container, 'focus', onFocus);
    if (onBlur) useEventListener(container, 'blur', onBlur);
    if (onSelectionChange) useEventListener(document, 'selectionchange', onSelectionChange);
    if (onCopyCut) {
      useEventListener(container, 'copy', onCopyCut);
      useEventListener(container, 'cut', onCopyCut);
    }
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
    loading,
    ready,
    error,
    init,
    destroy,
    getHTML,
    setHTML,
  };
}

/**
 * UEditor Plus 集成 composable
 *
 * 封装 UEditor Plus 的脚本加载、实例管理、adapter 初始化等逻辑，
 * 使 EditorCore.vue 不需要关心 UEditor Plus 的内部实现细节
 */

import { ref, shallowRef, nextTick } from 'vue';
import { useEventListener } from '@vueuse/core';
import { Editor, DOMRangeAdapter } from '../core/index';
import type { Editor as EditorType } from '../core/index';
import type { BaseEditorOptions, EditorComposable, SelectionContext } from './editor-utils';

/** composable 参数（UEditor Plus 无额外选项） */
interface UseUEditorPlusOptions extends BaseEditorOptions {}

/** UEditor Plus 静态资源基址（兼容 GitHub Pages 等非根路径部署） */
const UE_BASE = import.meta.env.BASE_URL + 'UEditorPlus';

/** 脚本是否已加载（全局单例） */
let ueScriptLoaded = false;

/**
 * 动态加载脚本
 */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * UEditor Plus composable
 *
 * 调用方在 onMounted 中调用 `init()` 初始化，
 * 在 onBeforeUnmount 中调用 `destroy()` 清理
 */
export function useUEditorPlus(options: UseUEditorPlusOptions): EditorComposable {
  const { containerRef, currentUser, onContentChange, onFocus, onBlur, onSelectionChange, onPaste } = options;

  const editor = shallowRef<EditorType | null>(null);
  const selectionContext = ref<SelectionContext>({ ownerWindow: window, container: null });
  const loading = ref(false);
  const ready = ref(false);
  const error = ref(false);

  let ueInstance: any = null;

  /**
   * 初始化 UEditor Plus
   */
  async function init(initialContent?: string) {
    loading.value = true;
    error.value = false;

    try {
      if (!ueScriptLoaded) {
        (window as any).UEDITOR_HOME_URL = UE_BASE + '/';
        (window as any).UEDITOR_CORS_URL = UE_BASE + '/';
        await loadScript(`${UE_BASE}/ueditor.config.js`);
        await loadScript(`${UE_BASE}/ueditor.all.js`);
        ueScriptLoaded = true;
      }

      /**
       * 修补 UEditor 的 domUtils 方法，防止 null/undefined 参数导致崩溃：
       * - hasClass: toolbars: [] 时 ColorButton 的 DOM 元素为 null
       * - isEmptyBlock: destroy() 后内部定时器（autosave/undo save）仍触发，
       *   此时 body 可能已被清空为 undefined
       */
      const UE = (window as any).UE;
      const du = UE?.dom?.domUtils;
      if (du) {
        if (du.hasClass && !du.hasClass.__patched) {
          const original = du.hasClass;
          du.hasClass = (el: Element | null, cls: string) => {
            if (!el) return false;
            return original(el, cls);
          };
          du.hasClass.__patched = true;
        }
        if (du.isEmptyBlock && !du.isEmptyBlock.__patched) {
          const original = du.isEmptyBlock;
          du.isEmptyBlock = (node: Node | null | undefined) => {
            if (!node) return 1;
            return original(node);
          };
          du.isEmptyBlock.__patched = true;
        }
      }
    } catch {
      loading.value = false;
      error.value = true;
      return;
    }

    await nextTick();
    const container = containerRef.value;
    if (!container) return;

    const containerId = 'ue-plus-' + Date.now();
    const target = document.createElement('script');
    target.id = containerId;
    target.type = 'text/plain';
    target.style.display = 'none';
    container.appendChild(target);

    ueInstance = (window as any).UE.getEditor(containerId, {
      toolbars: [],
      initialFrameHeight: 300,
      autoFloatEnabled: false,
      wordCount: false,
      elementPathEnabled: false,
      autoHeightEnabled: false,
      serverUrl: '',
      enableContextMenu: false,
      /** 禁用 UEditor 自带的自动保存，我们通过 useStorage 自行管理内容持久化 */
      enableAutoSave: false,
    });

    ueInstance.ready(() => {
      const body = ueInstance.body as HTMLElement;
      if (!body) return;

      /** 获取 iframe 的 window 和 document */
      const iframeEl = container.querySelector('iframe') as HTMLIFrameElement;
      const iframeWindow = iframeEl?.contentWindow ?? window;
      const iframeDocument = iframeEl?.contentDocument ?? document;

      selectionContext.value = { ownerWindow: iframeWindow, container: body };

      const adapter = new DOMRangeAdapter({ container: body, ownerWindow: iframeWindow });
      editor.value = new Editor({ adapter, currentUser });

      /** 设置初始内容 */
      if (initialContent) {
        ueInstance.setContent(initialContent, false);
      }

      /** 监听焦点事件（iframe 的 focus 事件在 window 上触发，不在 body 上） */
      if (onFocus) {
        useEventListener(iframeWindow, 'focus', onFocus);
      }
      if (onBlur) {
        useEventListener(iframeWindow, 'blur', onBlur);
      }
      if (onSelectionChange) {
        useEventListener(iframeDocument, 'selectionchange', onSelectionChange);
      }
      if (onPaste) {
        useEventListener(body, 'paste', onPaste);
      }

      /** 监听 UEditor 内容变化 */
      if (onContentChange) {
        ueInstance.addListener('contentchange', () => {
          onContentChange(getHTML());
        });
      }

      /** 确保 UEditor 容器可见 */
      const editorEl = container.querySelector('.edui-default');
      if (editorEl) (editorEl as HTMLElement).style.display = '';

      loading.value = false;
      ready.value = true;
    });
  }

  /**
   * 销毁 UEditor Plus 实例
   */
  function destroy() {
    if (ueInstance) {
      try { ueInstance.destroy(); } catch { /* UEditor destroy 内部可能报错 */ }
      ueInstance = null;
    }
  }

  /**
   * 获取 HTML 内容
   */
  function getHTML(): string {
    return ueInstance?.getContent() || '';
  }

  /**
   * 设置 HTML 内容
   */
  function setHTML(html: string) {
    ueInstance?.setContent(html, false);
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

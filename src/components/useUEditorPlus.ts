/**
 * UEditor Plus 集成 composable
 *
 * 封装 UEditor Plus 的脚本加载、实例管理、adapter 初始化等逻辑，
 * 使 EditorCore.vue 不需要关心 UEditor Plus 的内部实现细节
 */

import { ref } from 'vue';
import { nextTick } from 'vue';
import { useEventListener } from '@vueuse/core';
import { Editor, DOMRangeAdapter } from '../core/index';
import type { Editor as EditorType } from '../core/index';

/** 选区上下文（iframe 场景） */
interface SelectionContext {
  ownerWindow: Window;
  container: HTMLElement | null;
}

/** composable 参数 */
interface UseUEditorPlusOptions {
  /** UEditor Plus 容器 ref */
  containerRef: { value: HTMLElement | null };
  /** 当前用户名 */
  currentUser: string;
  /** 内容变化回调 */
  onContentChange?: (html: string) => void;
  /** 编辑器获得焦点 */
  onFocus?: () => void;
  /** 编辑器失去焦点 */
  onBlur?: () => void;
  /** iframe 内选区变化 */
  onSelectionChange?: () => void;
  /** 复制/剪切事件 */
  onCopyCut?: (event: ClipboardEvent) => void;
}

/** UEditor Plus 静态资源基址 */
const UE_BASE = '/UEditorPlus';

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
export function useUEditorPlus(options: UseUEditorPlusOptions) {
  const { containerRef, currentUser, onContentChange, onFocus, onBlur, onSelectionChange, onCopyCut } = options;

  const editor = ref<EditorType | null>(null);
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
    (target as HTMLScriptElement).type = 'text/plain';
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
      if (onCopyCut) {
        useEventListener(body, 'copy', onCopyCut);
        useEventListener(body, 'cut', onCopyCut);
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

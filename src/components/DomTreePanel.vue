<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { getElementPosition } from '../core/utils';

  interface TreeNode {
    key: string;
    depth: number;
    type: 'tag-open' | 'tag-close' | 'comment';
    tag: string;
    attrs: Array<{ name: string; value: string }>;
    /** 空元素（无子节点），渲染为 <tag /> */
    selfClosing: boolean;
    /** 内联文本（纯文本子节点），和开始标签同行显示 */
    inlineText?: string;
    /** 子元素数量，折叠时显示提示 */
    childElementCount: number;
    /** 在编辑器 DOM 中查找此节点所需的路径（深度优先遍历索引） */
    path: number[];
  }

  interface Props {
    /** 编辑器 HTML 内容 */
    html: string;
  }

  interface Emits {
    /** 点击节点，传递文档位置范围 */
    select: [start: number, end: number];
  }

  const props = defineProps<Props>();
  const emit = defineEmits<Emits>();

  /** 当前选中的节点 key */
  const activeKey = ref('');
  /** 折叠状态的节点 key 集合 */
  const collapsedKeys = ref<Set<string>>(new Set());

  /** 切换节点折叠状态 */
  function toggleCollapse(key: string) {
    const next = new Set(collapsedKeys.value);
    next.has(key) ? next.delete(key) : next.add(key);
    collapsedKeys.value = next;
  }

  /**
   * 将 HTML 解析为 DOM 树节点列表
   *
   * 使用 DOMParser 解析 HTML 字符串，文本节点内联到父标签行
   * 每个节点记录 path 用于在编辑器 live DOM 中定位
   */
  const nodes = computed<TreeNode[]>(() => {
    const html = props.html;
    if (!html.trim()) return [];

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const result: TreeNode[] = [];
    let keyCounter = 0;
    let elementIndex = 0;

    function addNode(node: Omit<TreeNode, 'key'>) {
      result.push({ ...node, key: String(keyCounter++) });
    }

    /** 提取纯文本子节点的内容 */
    function getInlineText(element: Element): string {
      const texts: string[] = [];
      for (const child of element.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const t = child.textContent || '';
          if (t.trim()) texts.push(t);
        }
      }
      return texts.join(' ');
    }

    /** 统计子元素数量 */
    function getChildElementCount(element: Element): number {
      let count = 0;
      for (const child of element.childNodes) {
        if (child instanceof Element) count++;
      }
      return count;
    }

    function walkNode(node: Node, depth: number) {
      if (node.nodeType === Node.TEXT_NODE) return;

      if (node.nodeType === Node.COMMENT_NODE) {
        addNode({
          type: 'comment', depth, tag: '!--',
          attrs: [], selfClosing: true,
          inlineText: node.textContent || '',
          childElementCount: 0,
          path: [-1],
        });
        return;
      }

      if (!(node instanceof Element)) return;

      const currentIndex = elementIndex;
      elementIndex++;

      const tag = node.tagName.toLowerCase();
      const attrs = Array.from(node.attributes).map(a => ({ name: a.name, value: a.value }));

      const isEmpty = node.childNodes.length === 0;
      const childElementCount = getChildElementCount(node);

      if (isEmpty) {
        /** 空元素 → <tag /> */
        addNode({ type: 'tag-open', depth, tag, attrs, selfClosing: true, childElementCount: 0, path: [currentIndex] });
      } else if (childElementCount === 0) {
        /** 纯文本 → <tag>text</tag> 单行显示 */
        addNode({
          type: 'tag-open', depth, tag, attrs, selfClosing: false,
          inlineText: getInlineText(node), childElementCount: 0,
          path: [currentIndex],
        });
      } else {
        /** 有子元素 → 支持折叠 */
        addNode({ type: 'tag-open', depth, tag, attrs, selfClosing: false, childElementCount, path: [currentIndex] });
        for (const child of node.childNodes) {
          walkNode(child, depth + 1);
        }
        addNode({ type: 'tag-close', depth, tag, attrs: [], selfClosing: false, childElementCount: 0, path: [currentIndex] });
      }
    }

    for (const child of doc.body.childNodes) {
      walkNode(child, 0);
    }

    return result;
  });

  /** 根据折叠状态过滤可见节点 */
  const visibleNodes = computed(() => {
    const result: TreeNode[] = [];
    /** 折叠时跳过子节点及闭合标签，直到遇到同层匹配的闭合标签 */
    let skipPath = -1;
    let skipDepth = -1;

    for (const node of nodes.value) {
      if (skipPath >= 0) {
        if (node.type === 'tag-close' && node.depth === skipDepth && node.path[0] === skipPath) {
          skipPath = -1;
        }
        continue;
      }
      result.push(node);
      if (collapsedKeys.value.has(node.key) && node.childElementCount > 0) {
        skipPath = node.path[0];
        skipDepth = node.depth;
      }
    }
    return result;
  });

  /**
   * 根据 path 在编辑器 live DOM 中查找对应元素
   *
   * path 是元素在 DOM 深度优先遍历中的全局索引
   */
  function findElementByPath(container: Element, targetIndex: number): Element | null {
    let current = -1;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node instanceof Element) {
        current++;
        if (current === targetIndex) return node;
      }
    }
    return null;
  }

  /**
   * 点击树节点 → 在编辑器中选中对应 range
   */
  function handleClick(node: TreeNode) {
    activeKey.value = node.key;

    if (node.path[0] === -1) return;

    const container = document.querySelector<HTMLElement>('[contenteditable]');
    if (!container) return;

    const element = findElementByPath(container, node.path[0]);
    if (!element) return;

    const pos = getElementPosition(element, container);
    if (!pos) return;

    emit('select', pos.start, pos.end);
  }
</script>

<template>
  <div class="flex-1 overflow-auto">
    <div v-if="visibleNodes.length === 0" class="text-xs text-gray-400 p-3">(空内容)</div>
    <div v-else class="p-1 font-mono text-xs leading-5 select-text">
      <div v-for="node in visibleNodes" :key="node.key"
        :style="{ paddingLeft: node.depth * 16 + 4 + 'px' }"
        :class="[
          'rounded px-1 whitespace-nowrap transition-colors',
          node.path[0] >= 0 ? 'cursor-pointer hover:bg-blue-50' : 'cursor-default',
          activeKey === node.key ? 'bg-blue-100' : '',
        ]"
        @click="handleClick(node)">

        <!-- 折叠/展开箭头 -->
        <span v-if="node.childElementCount > 0"
          class="inline-block w-3 text-center text-gray-400 cursor-pointer select-none mr-0.5"
          @click.stop="toggleCollapse(node.key)">
          {{ collapsedKeys.has(node.key) ? '▶' : '▼' }}
        </span>
        <span v-else class="inline-block w-3 mr-0.5"></span>

        <!-- 开始标签 -->
        <template v-if="node.type === 'tag-open'">
          <span class="text-gray-400">&lt;</span>
          <span class="text-blue-600">{{ node.tag }}</span>
          <template v-for="(attr, i) in node.attrs" :key="i">
            <span class="text-gray-300 ml-1">{{ attr.name }}</span><span class="text-gray-400">=</span><span class="text-orange-500">"{{ attr.value }}"</span>
          </template>
          <!-- 空元素 → <tag /> -->
          <template v-if="node.selfClosing">
            <span class="text-gray-400"> /&gt;</span>
          </template>
          <!-- 纯文本 → <tag>text</tag> -->
          <template v-else-if="node.inlineText">
            <span class="text-gray-400">&gt;</span>
            <span class="text-green-700">{{ node.inlineText }}</span>
            <span class="text-gray-400">&lt;/</span>
            <span class="text-blue-600">{{ node.tag }}</span>
            <span class="text-gray-400">&gt;</span>
          </template>
          <!-- 有子元素 -->
          <template v-else>
            <span class="text-gray-400">&gt;</span>
            <span v-if="collapsedKeys.has(node.key)" class="text-gray-400 italic ml-1">
              ... {{ node.childElementCount }} 个子元素
            </span>
          </template>
        </template>
        <!-- 结束标签 -->
        <template v-else-if="node.type === 'tag-close'">
          <span class="text-gray-400">&lt;/</span><span class="text-blue-600">{{ node.tag }}</span><span class="text-gray-400">&gt;</span>
        </template>
        <!-- 注释 -->
        <template v-else-if="node.type === 'comment'">
          <span class="text-gray-400">&lt;!--</span><span class="text-gray-500">{{ node.inlineText }}</span><span class="text-gray-400">--&gt;</span>
        </template>
      </div>
    </div>
  </div>
</template>

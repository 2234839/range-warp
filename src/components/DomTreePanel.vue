<script setup lang="ts">
  import { computed, ref } from 'vue';

  interface TreeNode {
    key: string;
    depth: number;
    type: 'tag-open' | 'tag-close' | 'text' | 'comment';
    tag: string;
    attrs: Array<{ name: string; value: string }>;
    /** 文本节点内容 */
    text?: string;
    /** 空元素（无子节点），渲染为 <tag /> */
    selfClosing: boolean;
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
    /** 点击节点，传递元素在 depth-first 遍历中的索引 */
    select: [elementIndex: number];
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
   * 使用 DOMParser 解析 HTML 字符串，元素节点和文本节点都作为独立条目
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

    /** 统计子元素数量（仅 Element 子节点） */
    function getChildElementCount(element: Element): number {
      let count = 0;
      for (const child of element.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) count++;
      }
      return count;
    }

    /** 提取元素内所有直接文本节点的内容（用于纯文本元素的紧凑显示） */
    function getTextContent(element: Element): string {
      const parts: string[] = [];
      for (const child of element.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          parts.push(child.textContent || '');
        }
      }
      return parts.join('');
    }

    function walkNode(node: Node, depth: number) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (!text) return;
        addNode({
          type: 'text', depth,
          tag: '', attrs: [], text, selfClosing: true,
          childElementCount: 0, path: [-1],
        });
        return;
      }

      if (node.nodeType === Node.COMMENT_NODE) {
        addNode({
          type: 'comment', depth, tag: '!--',
          attrs: [], selfClosing: true,
          text: node.textContent || '',
          childElementCount: 0, path: [-1],
        });
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node as Element;

      const currentIndex = elementIndex;
      elementIndex++;

      const tag = element.tagName.toLowerCase();
      const attrs = Array.from(element.attributes).map(a => ({ name: a.name, value: a.value }));

      const isEmpty = element.childNodes.length === 0;
      const childElementCount = getChildElementCount(element);
      /** 是否为纯文本元素（只有文本子节点，无元素子节点） */
      const isTextOnly = childElementCount === 0;

      if (isEmpty) {
        /** 空元素 → <tag /> */
        addNode({ type: 'tag-open', depth, tag, attrs, selfClosing: true, childElementCount: 0, path: [currentIndex] });
      } else if (isTextOnly) {
        /** 纯文本元素 → <tag>text</tag> 单行紧凑显示 */
        addNode({
          type: 'tag-open', depth, tag, attrs, selfClosing: false,
          text: getTextContent(element), childElementCount: 0, path: [currentIndex],
        });
      } else {
        /** 有子元素 → 支持折叠，文本节点作为独立条目渲染 */
        addNode({ type: 'tag-open', depth, tag, attrs, selfClosing: false, childElementCount, path: [currentIndex] });
        for (const child of element.childNodes) {
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
   * 点击树节点 → 通知父组件选中对应元素
   */
  function handleClick(node: TreeNode) {
    activeKey.value = node.key;

    if (node.path[0] === -1) return;

    emit('select', node.path[0]);
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

        <!-- 文本节点 -->
        <template v-if="node.type === 'text'">
          <span class="text-green-700">"{{ node.text }}"</span>
        </template>

        <!-- 开始标签 -->
        <template v-else-if="node.type === 'tag-open'">
          <span class="text-gray-400">&lt;</span>
          <span class="text-blue-600">{{ node.tag }}</span>
          <template v-for="(attr, i) in node.attrs" :key="i">
            <span class="text-orange-600 ml-1">{{ attr.name }}</span><span class="text-gray-400">=</span><span class="text-orange-500">"{{ attr.value }}"</span>
          </template>
          <!-- 空元素 → <tag /> -->
          <template v-if="node.selfClosing">
            <span class="text-gray-400"> /&gt;</span>
          </template>
          <!-- 纯文本元素 → <tag>text</tag> 单行紧凑 -->
          <template v-else-if="node.text !== undefined">
            <span class="text-gray-400">&gt;</span>
            <span class="text-green-700">{{ node.text }}</span>
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
          <span class="text-gray-400">&lt;!--</span><span class="text-gray-500">{{ node.text }}</span><span class="text-gray-400">--&gt;</span>
        </template>
      </div>
    </div>
  </div>
</template>

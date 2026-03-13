<script setup lang="ts">
  import { computed } from 'vue';
  import type { Editor } from '../core/Editor';

  /** 容器配置定义（由 Editor.getRegisteredConfigs() 返回） */
  interface ContainerDef {
    name: string;
    selector: string;
    idAttribute?: string;
    label?: string;
  }

  /** 容器条目（含位置信息） */
  interface ContainerEntry {
    key: string;
    configName: string;
    start: number;
    end: number;
    text: string;
    fragmentCount: number;
    attrs: Array<{ name: string; value: string }>;
  }

  /** 配置名 → badge 样式 */
  const CONFIG_COLORS: Record<string, string> = {
    bold: 'bg-red-100 text-red-700',
    italic: 'bg-purple-100 text-purple-700',
    underline: 'bg-blue-100 text-blue-700',
    strikethrough: 'bg-amber-100 text-amber-700',
    highlight: 'bg-emerald-100 text-emerald-700',
    bookmark: 'bg-yellow-100 text-yellow-700',
    'revision-insert': 'bg-teal-100 text-teal-700',
    'revision-delete': 'bg-rose-100 text-rose-700',
  };

  /** 兜底中文标签（当注册配置未提供 label 时使用） */
  const FALLBACK_LABELS: Record<string, string> = {
    bold: '粗体', italic: '斜体', underline: '下划线',
    strikethrough: '删除线', highlight: '高亮', bookmark: '书签',
    'revision-insert': '插入修订', 'revision-delete': '删除修订',
  };

  interface Props {
    editor: Editor | null;
  }

  const props = defineProps<Props>();

  const configDefs = computed<ContainerDef[]>(() => {
    return props.editor?.getRegisteredConfigs() ?? [];
  });

  /** 获取配置名的中文标签 */
  function getLabel(configName: string): string {
    const def = configDefs.value.find(d => d.name === configName);
    return def?.label || FALLBACK_LABELS[configName] || configName;
  }

  /**
   * 收集所有容器实例
   *
   * 1. 通过 querySelectorAll 查询每个配置的匹配元素
   * 2. 通过 getElementPosition 获取真实文本位置
   * 3. 相同 ID 的分片合并为逻辑容器
   * 4. 按文档位置排序
   */
  const entries = computed<ContainerEntry[]>(() => {
    const ed = props.editor;
    if (!ed) return [];

    const defs = configDefs.value;
    if (defs.length === 0) return [];

    /** Phase 1: 收集原始容器数据，按 (configName:id) 分组 */
    const rawMap = new Map<string, {
      configName: string;
      fragments: Array<{ start: number; end: number; text: string }>;
      attrs: Array<{ name: string; value: string }>;
    }>();

    for (const def of defs) {
      const elements = ed.querySelectorAll(def.selector);
      for (const el of elements) {
        const pos = ed.getElementPosition(el);
        if (!pos) continue;

        const id = def.idAttribute ? el.getAttribute(def.idAttribute) || undefined : undefined;
        const mapKey = id ? `${def.name}:${id}` : `${def.name}:${pos.start}:${pos.end}`;

        const text = ed.getText(pos.start, pos.end);
        const attrs = Array.from(el.attributes)
          .filter(a => a.name.startsWith('data-'))
          .map(a => ({ name: a.name, value: a.value }));

        let entry = rawMap.get(mapKey);
        if (!entry) {
          entry = { configName: def.name, fragments: [], attrs };
          rawMap.set(mapKey, entry);
        }
        entry.fragments.push({ start: pos.start, end: pos.end, text });
      }
    }

    /** Phase 2: 合并分片为逻辑容器，按位置排序 */
    const result: ContainerEntry[] = [];
    let keyCounter = 0;

    for (const raw of rawMap.values()) {
      const starts = raw.fragments.map(f => f.start);
      const ends = raw.fragments.map(f => f.end);
      result.push({
        key: String(keyCounter++),
        configName: raw.configName,
        start: Math.min(...starts),
        end: Math.max(...ends),
        text: raw.fragments.map(f => f.text).join(''),
        fragmentCount: raw.fragments.length,
        attrs: raw.attrs,
      });
    }

    result.sort((a, b) => a.start - b.start || b.end - a.end);
    return result;
  });

  /** 文档全文 */
  const fullText = computed(() => {
    const ed = props.editor;
    if (!ed) return '';
    return ed.getText(0, ed.getDocumentLength());
  });

  /** 按容器跨度降序排列（最长排在最左侧，形成堆叠效果） */
  const sortedByLength = computed(() => {
    return [...entries.value].sort((a, b) => (b.end - b.start) - (a.end - a.start));
  });

  /** 预计算每个位置活跃的容器列表（已按长度排序） */
  const activeMap = computed(() => {
    const map = new Map<number, ContainerEntry[]>();
    for (const entry of sortedByLength.value) {
      for (let i = entry.start; i < entry.end; i++) {
        let list = map.get(i);
        if (!list) {
          list = [];
          map.set(i, list);
        }
        list.push(entry);
      }
    }
    return map;
  });

  /** 唯一容器类型（用于图例，保持注册顺序） */
  const uniqueTypes = computed(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const def of configDefs.value) {
      if (entries.value.some(e => e.configName === def.name) && !seen.has(def.name)) {
        seen.add(def.name);
        result.push(def.name);
      }
    }
    return result;
  });

  /** 统计摘要 */
  const stats = computed(() => {
    const all = entries.value;
    return {
      configTypes: new Set(all.map(e => e.configName)).size,
      totalContainers: all.length,
      splitContainers: all.filter(e => e.fragmentCount > 1).length,
    };
  });
</script>

<template>
  <div class="flex-1 overflow-auto flex flex-col">
    <div v-if="!editor" class="text-xs text-gray-400 p-3">编辑器未就绪</div>
    <div v-else-if="entries.length === 0" class="text-xs text-gray-400 p-3">(无容器)</div>
    <div v-else class="p-1 font-mono text-xs select-text">
      <!-- 统计摘要 -->
      <div class="px-2 py-1 text-gray-400 border-b border-gray-100 mb-1">
        {{ stats.configTypes }} 种容器 · {{ stats.totalContainers }} 个
        <span v-if="stats.splitContainers > 0" class="text-orange-500"> · {{ stats.splitContainers }} 跨块</span>
      </div>

      <!-- 颜色图例 -->
      <div class="px-2 py-0.5 border-b border-gray-100 mb-1 flex flex-wrap gap-x-2 gap-y-0.5">
        <span v-for="configName in uniqueTypes" :key="configName" class="flex items-center gap-0.5">
          <span :class="['inline-block w-2 h-2 rounded-sm', CONFIG_COLORS[configName] || 'bg-gray-100']"></span>
          <span class="text-[9px] text-gray-500">{{ getLabel(configName) }}</span>
        </span>
      </div>

      <!-- 时间轴：字符 × 容器条块 -->
      <div>
        <div v-for="(char, i) in fullText" :key="i" class="flex items-center h-3.5">
          <!-- 行号 -->
          <span class="w-5 text-right text-gray-300 mr-0.5 text-[8px] shrink-0 select-none">{{ i }}</span>
          <!-- 字符 -->
          <span class="w-2.5 text-gray-600 text-[10px] shrink-0 overflow-hidden whitespace-nowrap">
            {{ char === '\n' ? '↵' : char === ' ' ? '·' : char }}
          </span>
          <!-- 容器条块：按长度排序，长容器在左 -->
          <div class="flex gap-px">
            <span v-for="entry in activeMap.get(i) || []" :key="entry.key"
              :class="['text-[10px] leading-none', CONFIG_COLORS[entry.configName] || 'bg-gray-100']"
              :title="`${getLabel(entry.configName)} [${entry.start},${entry.end}]${entry.fragmentCount > 1 ? ` (${entry.fragmentCount}f)` : ''}`">
              █
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

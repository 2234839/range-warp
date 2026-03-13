<script setup lang="ts">
  import { ref, computed } from 'vue';
  import type { Editor } from '../core/Editor';
  import { computeColumnLayout } from '../utils/container-column-layout';
  import type { ContainerEntry, LayoutEntry } from '../utils/container-column-layout';

  /** 容器配置定义（由 Editor.getRegisteredConfigs() 返回） */
  interface ContainerDef {
    name: string;
    selector: string;
    idAttribute?: string;
    label?: string;
  }

  /** 视觉行段：要么是单行，要么是折叠的行范围 */
  interface RowSegment {
    /** 原始起始行号 */
    startRow: number;
    /** 原始结束行号（exclusive） */
    endRow: number;
    /** 是否为折叠段 */
    folded: boolean;
  }

  /** 每行高度（px） */
  const ROW_HEIGHT = 14;

  /** 折叠行高度（px） */
  const FOLD_HEIGHT = 16;

  /** 最小折叠行数 */
  const MIN_FOLD_ROWS = 3;

  /** 每条竖条宽度（px） */
  const STRIP_WIDTH = 20;

  /** 竖条间距（px） */
  const STRIP_GAP = 2;

  /** 左侧字符区实际宽度 */
  const LEFT_WIDTH = 38;

  /** 竖条内文字最少需要的像素高度 */
  const MIN_TEXT_HEIGHT = 28;

  /** 配置名 → 背景色 */
  const CONFIG_COLORS: Record<string, string> = {
    bold: 'bg-red-400',
    italic: 'bg-purple-400',
    underline: 'bg-blue-400',
    strikethrough: 'bg-amber-400',
    highlight: 'bg-emerald-400',
    bookmark: 'bg-yellow-400',
    'revision-insert': 'bg-teal-400',
    'revision-delete': 'bg-rose-400',
  };

  /** 配置名 → 图例色 */
  const LEGEND_COLORS: Record<string, string> = {
    bold: 'bg-red-500',
    italic: 'bg-purple-500',
    underline: 'bg-blue-500',
    strikethrough: 'bg-amber-500',
    highlight: 'bg-emerald-500',
    bookmark: 'bg-yellow-500',
    'revision-insert': 'bg-teal-500',
    'revision-delete': 'bg-rose-500',
  };

  /** 兜底中文标签 */
  const FALLBACK_LABELS: Record<string, string> = {
    bold: '粗体', italic: '斜体', underline: '下划线',
    strikethrough: '删除线', highlight: '高亮', bookmark: '书签',
    'revision-insert': '插入修订', 'revision-delete': '删除修订',
  };

  interface Props {
    editor: Editor | null;
    /** 编辑器 HTML 内容（作为响应式依赖，驱动面板刷新） */
    html?: string;
  }

  const props = defineProps<Props>();

  /** 折叠状态：被展开的折叠段 key */
  const expandedFolds = ref(new Set<string>());

  const configDefs = computed<ContainerDef[]>(() => {
    return props.editor?.getRegisteredConfigs() ?? [];
  });

  function getLabel(configName: string): string {
    const def = configDefs.value.find(d => d.name === configName);
    return def?.label || FALLBACK_LABELS[configName] || configName;
  }

  /**
   * 收集所有容器实例
   */
  const entries = computed<ContainerEntry[]>(() => {
    void props.html;

    const ed = props.editor;
    if (!ed) return [];

    const defs = configDefs.value;
    if (defs.length === 0) return [];

    const prebuiltIndex = ed.buildIndex();

    const rawMap = new Map<string, {
      configName: string;
      fragments: Array<{ start: number; end: number }>;
    }>();

    for (const def of defs) {
      const elements = ed.querySelectorAll(def.selector);
      for (const el of elements) {
        const pos = ed.getElementPosition(el, prebuiltIndex);
        if (!pos) continue;

        const id = def.idAttribute ? el.getAttribute(def.idAttribute) || undefined : undefined;
        const mapKey = id ? `${def.name}:${id}` : `${def.name}:${pos.start}:${pos.end}`;

        let entry = rawMap.get(mapKey);
        if (!entry) {
          entry = { configName: def.name, fragments: [] };
          rawMap.set(mapKey, entry);
        }
        entry.fragments.push({ start: pos.start, end: pos.end });
      }
    }

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
        fragmentCount: raw.fragments.length,
      });
    }

    return result;
  });

  /** 文档全文 */
  const fullText = computed(() => {
    void props.html;

    const ed = props.editor;
    if (!ed) return '';
    return ed.getText(0, ed.getDocumentLength());
  });

  /** 所有容器起止行号的集合（边界行） */
  const boundaryRows = computed(() => {
    const set = new Set<number>();
    for (const e of entries.value) {
      set.add(e.start);
      set.add(e.end);
    }
    return set;
  });

  /**
   * 将全文行分片为行段：
   * - 有边界的行 → 单独一段
   * - 连续 ≥ MIN_FOLD_ROWS 个无边界行 → 折叠段（可展开）
   */
  const rowSegments = computed<RowSegment[]>(() => {
    const len = fullText.value.length;
    const boundaries = boundaryRows.value;
    const segments: RowSegment[] = [];
    let gapStart = -1;

    for (let i = 0; i < len; i++) {
      if (boundaries.has(i)) {
        if (gapStart >= 0) {
          const gapLen = i - gapStart;
          if (gapLen >= MIN_FOLD_ROWS) {
            segments.push({ startRow: gapStart, endRow: i, folded: true });
          } else {
            for (let j = gapStart; j < i; j++) {
              segments.push({ startRow: j, endRow: j + 1, folded: false });
            }
          }
          gapStart = -1;
        }
        segments.push({ startRow: i, endRow: i + 1, folded: false });
      } else {
        if (gapStart < 0) gapStart = i;
      }
    }

    /** 处理末尾的 gap */
    if (gapStart >= 0) {
      const gapLen = len - gapStart;
      if (gapLen >= MIN_FOLD_ROWS) {
        segments.push({ startRow: gapStart, endRow: len, folded: true });
      } else {
        for (let j = gapStart; j < len; j++) {
          segments.push({ startRow: j, endRow: j + 1, folded: false });
        }
      }
    }

    return segments;
  });

  /** 折叠段是否展开 */
  function isExpanded(seg: RowSegment): boolean {
    return expandedFolds.value.has(`${seg.startRow}-${seg.endRow}`);
  }

  /** 切换折叠段展开状态 */
  function toggleFold(seg: RowSegment) {
    const key = `${seg.startRow}-${seg.endRow}`;
    if (expandedFolds.value.has(key)) {
      expandedFolds.value.delete(key);
    } else {
      expandedFolds.value.add(key);
    }
    /** 触发响应式更新 */
    expandedFolds.value = new Set(expandedFolds.value);
  }

  /** 将字符渲染为可见符号 */
  function charDisplay(ch: string): string {
    if (ch === '\n') return '↵';
    if (ch === ' ') return '·';
    return ch;
  }

  /**
   * 原始行号 → 视觉 Y 偏移量映射
   *
   * 折叠段内所有行压缩为折叠行高度
   * 展开的折叠段末尾额外留出收起按钮的高度（FOLD_HEIGHT）
   */
  const visualOffsetMap = computed(() => {
    const map = new Map<number, number>();
    let y = 0;

    for (const seg of rowSegments.value) {
      if (seg.folded && !isExpanded(seg)) {
        for (let i = seg.startRow; i < seg.endRow; i++) {
          map.set(i, y);
        }
        y += FOLD_HEIGHT;
      } else if (seg.folded && isExpanded(seg)) {
        for (let i = seg.startRow; i < seg.endRow; i++) {
          map.set(i, y);
          y += ROW_HEIGHT;
        }
        /** 展开段末尾留出收起按钮高度 */
        y += FOLD_HEIGHT;
      } else {
        for (let i = seg.startRow; i < seg.endRow; i++) {
          map.set(i, y);
          y += ROW_HEIGHT;
        }
      }
    }

    return map;
  });

  /** 总视觉高度（含展开折叠段的收起按钮高度） */
  const totalVisualHeight = computed(() => {
    let y = 0;
    for (const seg of rowSegments.value) {
      if (seg.folded && !isExpanded(seg)) {
        y += FOLD_HEIGHT;
      } else if (seg.folded && isExpanded(seg)) {
        y += (seg.endRow - seg.startRow) * ROW_HEIGHT + FOLD_HEIGHT;
      } else {
        y += (seg.endRow - seg.startRow) * ROW_HEIGHT;
      }
    }
    return y;
  });

  /**
   * 贪心列分配：最长的容器排在最左侧，同类型优先同列
   *
   * 规则：
   * 1. 按跨度降序排列（最长容器最左）
   * 2. 同 configName 的容器优先分配到已有同类型的列
   * 3. 若同类型列不可用（有重叠），选择最左可用列
   * 4. 同一列内容器不能垂直重叠（检查实际重叠，而非仅末尾位置）
   */
  const columnLayout = computed<LayoutEntry[]>(() => {
    return computeColumnLayout(entries.value);
  });

  /** 当前选中的条目 key */
  const selectedKey = ref<string | null>(null);

  /** 当前选中的条目对象 */
  const selectedEntry = computed<LayoutEntry | null>(() => {
    if (!selectedKey.value) return null;
    return columnLayout.value.find(e => e.key === selectedKey.value) || null;
  });

  /** 当前选中条目的文本内容 */
  const selectedText = computed(() => {
    const e = selectedEntry.value;
    if (!e) return '';
    const ed = props.editor;
    if (!ed) return '';
    return ed.getText(e.start, e.end);
  });

  /** 当前选中条目的折叠后视觉高度 */
  function getVisualHeight(entry: LayoutEntry): number {
    const map = visualOffsetMap.value;
    const topY = map.get(entry.start) ?? 0;
    const bottomY = map.get(entry.end - 1) ?? topY;
    return bottomY - topY + ROW_HEIGHT;
  }

  /** 当前选中条目的折叠后视觉 top */
  function getVisualTop(entry: LayoutEntry): number {
    return visualOffsetMap.value.get(entry.start) ?? 0;
  }

  /** 点击竖条 → 直接在编辑器中选中对应文本 */
  function selectStrip(entry: LayoutEntry) {
    const ed = props.editor;
    if (!ed) return;
    selectedKey.value = entry.key;
    ed.createRange(entry.start, entry.end).select();
  }

  /** 移除选中容器 */
  function removeSelected() {
    const ed = props.editor;
    if (!ed || !selectedEntry.value) return;
    const e = selectedEntry.value;
    ed.removeContainer(e.start, e.end, e.configName);
    selectedKey.value = null;
  }

  /** 取消选中 */
  function cancelSelect() {
    selectedKey.value = null;
  }

  /** 图例中显示的容器类型 */
  const uniqueTypes = computed(() => {
    const entryNames = new Set(entries.value.map(e => e.configName));
    const seen = new Set<string>();
    const result: string[] = [];
    for (const name of configDefs.value.map(d => d.name)) {
      if (entryNames.has(name) && !seen.has(name)) {
        seen.add(name);
        result.push(name);
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
    <div v-else class="flex flex-col min-h-0">
      <!-- 统计摘要 -->
      <div class="shrink-0 px-2 py-1 text-gray-400 border-b border-gray-100">
        <span class="text-[10px]">
          {{ stats.configTypes }} 种容器 · {{ stats.totalContainers }} 个
          <span v-if="stats.splitContainers > 0" class="text-orange-500"> · {{ stats.splitContainers }} 跨块</span>
        </span>
      </div>
      <!-- 图例（独立行） -->
      <div v-if="uniqueTypes.length > 0" class="shrink-0 px-2 py-0.5 border-b border-gray-100 flex flex-wrap gap-x-1.5 gap-y-0.5">
        <span v-for="configName in uniqueTypes" :key="configName" class="flex items-center gap-0.5">
          <span :class="['inline-block w-1.5 h-1.5 rounded-sm', LEGEND_COLORS[configName] || 'bg-gray-500']"></span>
          <span class="text-[8px] text-gray-500">{{ getLabel(configName) }}</span>
        </span>
      </div>
      <!-- 可滚动的可视化区域 -->
      <div class="flex-1 overflow-auto min-h-0 p-1 font-mono text-xs select-text">

      <!-- 覆盖范围可视化 -->
      <div class="relative" :style="{ height: totalVisualHeight + 'px' }">
        <!-- 字符行段 -->
        <template v-for="(seg, si) in rowSegments" :key="si">
          <!-- 折叠段（收起状态） -->
          <template v-if="seg.folded && !isExpanded(seg)">
            <div class="border-y border-dashed border-gray-200 cursor-pointer hover:bg-gray-50/50 transition-colors"
                 :style="{ height: FOLD_HEIGHT + 'px', position: 'absolute', left: '0', right: '0', top: (visualOffsetMap.get(seg.startRow) ?? 0) + 'px' }"
                 @click="toggleFold(seg)"></div>
            <div class="flex items-center cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors border-r border-dashed border-gray-300"
                 :style="{ height: FOLD_HEIGHT + 'px', position: 'absolute', left: '0', width: LEFT_WIDTH + 'px', top: (visualOffsetMap.get(seg.startRow) ?? 0) + 'px' }"
                 @click="toggleFold(seg)">
              <span class="flex-1 text-center text-[9px] text-gray-400 select-none">{{ seg.startRow }}…{{ seg.endRow - seg.startRow }}</span>
            </div>
          </template>

          <!-- 展开的折叠段（显示每一行） -->
          <template v-else-if="seg.folded && isExpanded(seg)">
            <div v-for="i in (seg.endRow - seg.startRow)" :key="i"
                 class="flex items-center bg-white relative"
                 :style="{ height: ROW_HEIGHT + 'px', position: 'absolute', left: '0', right: '0', top: (visualOffsetMap.get(seg.startRow + i - 1) ?? 0) + 'px' }">
              <span class="w-6 text-right text-gray-300 mr-0.5 text-[9px] shrink-0 select-none">{{ seg.startRow + i - 1 }}</span>
              <span class="w-3 text-gray-600 text-[11px] shrink-0 overflow-hidden whitespace-nowrap">
                {{ charDisplay(fullText[seg.startRow + i - 1]) }}
              </span>
            </div>
            <!-- 折叠段末尾：收起按钮 -->
            <div class="border-y border-dashed border-amber-200 cursor-pointer hover:bg-amber-50/50 transition-colors"
                 :style="{ height: FOLD_HEIGHT + 'px', position: 'absolute', left: '0', right: '0', top: ((visualOffsetMap.get(seg.endRow - 1) ?? 0) + ROW_HEIGHT) + 'px' }"
                 @click="toggleFold(seg)"></div>
            <div class="flex items-center cursor-pointer bg-amber-50 hover:bg-amber-100 transition-colors border-r border-dashed border-amber-300"
                 :style="{ height: FOLD_HEIGHT + 'px', position: 'absolute', left: '0', width: LEFT_WIDTH + 'px', top: ((visualOffsetMap.get(seg.endRow - 1) ?? 0) + ROW_HEIGHT) + 'px' }"
                 @click="toggleFold(seg)">
              <span class="flex-1 text-center text-[9px] text-amber-500 select-none">∧ 收起</span>
            </div>
          </template>

          <!-- 普通单行 -->
          <div v-else
               class="flex items-center bg-white relative"
               :style="{ height: ROW_HEIGHT + 'px', position: 'absolute', left: '0', right: '0', top: (visualOffsetMap.get(seg.startRow) ?? 0) + 'px' }">
            <span class="w-6 text-right text-gray-300 mr-0.5 text-[9px] shrink-0 select-none">{{ seg.startRow }}</span>
            <span class="w-3 text-gray-600 text-[11px] shrink-0 overflow-hidden whitespace-nowrap">
              {{ charDisplay(fullText[seg.startRow]) }}
            </span>
          </div>
        </template>

        <!-- 容器竖条层 -->
        <div class="absolute top-0 bottom-0 pointer-events-none"
             :style="{ left: LEFT_WIDTH + 'px', right: '0' }">
          <div v-for="entry in columnLayout" :key="entry.key"
               class="absolute rounded-sm pointer-events-auto cursor-pointer hover:brightness-110 transition-all"
               :class="[
                 CONFIG_COLORS[entry.configName] || 'bg-gray-400',
                 entry.key === selectedKey ? 'ring-1 ring-black ring-offset-1 brightness-90' : '',
               ]"
               :style="{
                 top: getVisualTop(entry) + 'px',
                 height: getVisualHeight(entry) + 'px',
                 left: entry.column * (STRIP_WIDTH + STRIP_GAP) + 'px',
                 width: STRIP_WIDTH + 'px',
               }"
               @click="selectStrip(entry)">
            <!-- 竖排文字标注（条高度足够时显示） -->
            <span v-if="getVisualHeight(entry) >= MIN_TEXT_HEIGHT"
                  class="absolute inset-0 flex items-center justify-center text-[8px] font-medium text-white/90 select-none leading-none"
                  style="writing-mode: vertical-rl;">
              {{ getLabel(entry.configName) }}
            </span>
          </div>
        </div>
      </div>
      </div>

      <!-- 选中容器的操作栏（固定底部） -->
      <div v-if="selectedEntry" class="shrink-0 px-2 py-1.5 bg-gray-50 border-t border-gray-200 text-[10px] flex items-center gap-2">
        <span :class="['inline-block w-2 h-2 rounded-sm shrink-0', LEGEND_COLORS[selectedEntry.configName] || 'bg-gray-500']"></span>
        <span class="font-medium text-gray-700">{{ getLabel(selectedEntry.configName) }}</span>
        <span class="text-gray-400">[{{ selectedEntry.start }},{{ selectedEntry.end }}]</span>
        <span v-if="selectedEntry.fragmentCount > 1" class="text-orange-500">{{ selectedEntry.fragmentCount }}片</span>
        <span class="text-gray-300 mx-0.5">|</span>
        <span class="text-gray-500 truncate max-w-30">"{{ selectedText }}"</span>
        <span class="flex-1"></span>
        <button @click="removeSelected" class="px-1.5 py-0.5 text-red-600 hover:bg-red-50 rounded transition-colors">移除</button>
        <button @click="cancelSelect" class="px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 rounded transition-colors">取消</button>
      </div>
    </div>
  </div>
</template>

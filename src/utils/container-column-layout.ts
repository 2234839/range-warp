/**
 * 容器覆盖范围面板 - 列分配算法
 *
 * 核心职责：将容器条目分配到竖条列，实现紧凑的视觉布局
 *
 * 规则：
 * 1. 按跨度降序排列（最长容器最左）
 * 2. 同 configName 的容器优先分配到已有同类型的列
 * 3. 若同类型列不可用（有重叠），选择最左可用列
 * 4. 同一列内容器不能垂直重叠（检查实际重叠，而非仅末尾位置）
 */

/** 容器条目（含位置信息） */
export interface ContainerEntry {
  key: string;
  configName: string;
  start: number;
  end: number;
  fragmentCount: number;
}

/** 带列号的布局条目 */
export interface LayoutEntry extends ContainerEntry {
  column: number;
}

/**
 * 贪心列分配算法
 *
 * 使用 columnEntries 追踪每列所有条目，通过实际区间重叠检测
 * （而非简单的末尾位置比较）确保正确性。
 * 这解决了按跨度排序后，处理顺序与时间顺序不一致时的误判问题。
 */
export function computeColumnLayout(entries: ContainerEntry[]): LayoutEntry[] {
  const sorted = [...entries].sort(
    (a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start,
  );

  /** 每列已有的条目列表（用于检查实际重叠） */
  const columnEntries: Array<Array<{ start: number; end: number }>> = [];
  /** configName → 已分配的列号集合 */
  const typeColumns = new Map<string, Set<number>>();
  const layout: LayoutEntry[] = [];

  /** 检查新条目能否放入指定列（不与任何已有条目重叠） */
  function canPlace(col: number, start: number, end: number): boolean {
    for (const existing of columnEntries[col]) {
      if (start < existing.end && end > existing.start) return false;
    }
    return true;
  }

  for (const entry of sorted) {
    /** 优先找同类型的可用列 */
    const sameTypeCols = typeColumns.get(entry.configName);
    let col = -1;

    if (sameTypeCols) {
      for (const c of sameTypeCols) {
        if (canPlace(c, entry.start, entry.end)) {
          col = c;
          break;
        }
      }
    }

    /** 同类型列不可用 → 找最左可用列 */
    if (col === -1) {
      for (let c = 0; c < columnEntries.length; c++) {
        if (canPlace(c, entry.start, entry.end)) {
          col = c;
          break;
        }
      }
    }

    /** 所有列都有重叠 → 新建列 */
    if (col === -1) {
      col = columnEntries.length;
      columnEntries.push([]);
    }

    columnEntries[col].push({ start: entry.start, end: entry.end });

    if (!typeColumns.has(entry.configName)) {
      typeColumns.set(entry.configName, new Set());
    }
    typeColumns.get(entry.configName)!.add(col);

    layout.push({ ...entry, column: col });
  }

  return layout;
}

/**
 * ContainerCoveragePanel 列分配算法测试
 *
 * 测试路径: src/utils/container-column-layout.ts
 */
import { computeColumnLayout } from '../utils/container-column-layout';
import type { ContainerEntry, LayoutEntry } from '../utils/container-column-layout';

// ============================================================
// 辅助函数
// ============================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

/** 获取每个 configName 的列号集合 */
function getColumnsByType(layout: LayoutEntry[]): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();
  for (const entry of layout) {
    if (!result.has(entry.configName)) {
      result.set(entry.configName, new Set());
    }
    result.get(entry.configName)!.add(entry.column);
  }
  return result;
}

/** 计算总列数 */
function getTotalColumns(layout: LayoutEntry[]): number {
  let max = 0;
  for (const entry of layout) {
    max = Math.max(max, entry.column + 1);
  }
  return max;
}

// ============================================================
// 测试用例
// ============================================================

console.log('=== 列分配算法测试 ===\n');

// --- 测试 1：用户报告的场景 - 跨块书签 + 嵌套样式 ---
console.log('1. 用户报告的场景：bookmark 跨块 + 多个 bold');
{
  const entries: ContainerEntry[] = [
    { key: '0', configName: 'bold', start: 0, end: 2, fragmentCount: 1 },
    { key: '1', configName: 'strikethrough', start: 1, end: 2, fragmentCount: 1 },
    { key: '2', configName: 'italic', start: 3, end: 4, fragmentCount: 1 },
    { key: '3', configName: 'strikethrough', start: 3, end: 4, fragmentCount: 1 },
    { key: '4', configName: 'underline', start: 3, end: 4, fragmentCount: 1 },
    { key: '5', configName: 'bookmark', start: 5, end: 25, fragmentCount: 4 },
    { key: '6', configName: 'bold', start: 11, end: 15, fragmentCount: 1 },
  ];

  const layout = computeColumnLayout(entries);
  const colsByType = getColumnsByType(layout);

  console.log('  布局结果:');
  for (const entry of layout) {
    console.log(`    ${entry.configName} [${entry.start},${entry.end}] → 列 ${entry.column}`);
  }

  const bCols = colsByType.get('bold');
  assert(bCols!.size === 1, `bold 同列: ${JSON.stringify([...bCols!])}`);

  /**
   * strikethrough [1,2] 和 [3,4] 互不重叠，但 [3,4] 与 italic [3,4] 位置完全相同，
   * italic 已占列 0，所以 strikethrough [3,4] 无法放列 0 → 分到其他列
   * 这是正确行为：列内不允许任何重叠（即使不同类型）
   */

  const totalCols = getTotalColumns(layout);
  console.log(`  总列数: ${totalCols}`);
  assert(totalCols <= 3, `总列数 ≤ 3（实际 ${totalCols}）`);
}

// --- 测试 2：完全重叠的同类型容器必须分列 ---
console.log('\n2. 完全重叠的同类型容器必须分列');
{
  const entries: ContainerEntry[] = [
    { key: '0', configName: 'bold', start: 0, end: 5, fragmentCount: 1 },
    { key: '1', configName: 'bold', start: 2, end: 7, fragmentCount: 1 },
  ];

  const layout = computeColumnLayout(entries);
  assert(layout[0].column !== layout[1].column,
    `重叠的 bold 在不同列: 列${layout[0].column} vs 列${layout[1].column}`);
}

// --- 测试 3：不重叠的同类型容器应同列 ---
console.log('\n3. 不重叠的同类型容器应同列');
{
  const entries: ContainerEntry[] = [
    { key: '0', configName: 'italic', start: 0, end: 3, fragmentCount: 1 },
    { key: '1', configName: 'italic', start: 5, end: 8, fragmentCount: 1 },
    { key: '2', configName: 'italic', start: 10, end: 12, fragmentCount: 1 },
  ];

  const layout = computeColumnLayout(entries);
  const colsByType = getColumnsByType(layout);
  assert(colsByType.get('italic')!.size === 1,
    `3个不重叠 italic 同列: ${JSON.stringify([...colsByType.get('italic')!])}`);
}

// --- 测试 4：不同类型混合排列 ---
console.log('\n4. 不同类型混合排列');
{
  const entries: ContainerEntry[] = [
    { key: '0', configName: 'bold', start: 0, end: 10, fragmentCount: 1 },
    { key: '1', configName: 'italic', start: 2, end: 8, fragmentCount: 1 },
    { key: '2', configName: 'bold', start: 15, end: 20, fragmentCount: 1 },
  ];

  const layout = computeColumnLayout(entries);
  const colsByType = getColumnsByType(layout);
  assert(colsByType.get('bold')!.size === 1,
    `两个 bold 同列（不重叠）: ${JSON.stringify([...colsByType.get('bold')!])}`);
}

// --- 测试 5：最长容器优先最左列 ---
console.log('\n5. 最长容器优先最左列');
{
  const entries: ContainerEntry[] = [
    { key: '0', configName: 'bold', start: 0, end: 3, fragmentCount: 1 },
    { key: '1', configName: 'italic', start: 0, end: 20, fragmentCount: 1 },
  ];

  const layout = computeColumnLayout(entries);

  const italicEntry = layout.find(e => e.configName === 'italic');
  assert(italicEntry?.column === 0,
    `italic（跨度20）在列 0（实际 列${italicEntry?.column}）`);
}

// --- 测试 6：空 entries ---
console.log('\n6. 空 entries');
{
  const layout = computeColumnLayout([]);
  assert(layout.length === 0, '空 entries 返回空布局');
}

// --- 测试 7：单个 entry ---
console.log('\n7. 单个 entry');
{
  const entries: ContainerEntry[] = [
    { key: '0', configName: 'bold', start: 5, end: 10, fragmentCount: 1 },
  ];

  const layout = computeColumnLayout(entries);
  assert(layout.length === 1 && layout[0].column === 0,
    '单个 entry 分配到列 0');
}

// --- 测试 8：跨度排序后处理顺序与时间顺序不一致 ---
console.log('\n8. 跨度排序后同类型非相邻分配');
{
  /**
   * 关键场景：短 entry 在长 entry 之前（时间上），但排序后长 entry 先处理
   * A [0,2] B [10,15] 同类型，C [3,20] 另一类型
   *
   * 排序后：C(跨度17) → B(跨度5) → A(跨度2)
   * C 先放列 0，B 检查同类型列 → 无，找最左可用列 → 列 0 被 C 占用，新列 1
   * A 检查同类型列 → 列 1 (B 在列 1)，A[0,2] 与 B[10,15] 不重叠 → 放列 1
   */
  const entries: ContainerEntry[] = [
    { key: '0', configName: 'bold', start: 0, end: 2, fragmentCount: 1 },
    { key: '1', configName: 'bookmark', start: 3, end: 20, fragmentCount: 1 },
    { key: '2', configName: 'bold', start: 10, end: 15, fragmentCount: 1 },
  ];

  const layout = computeColumnLayout(entries);
  const colsByType = getColumnsByType(layout);

  console.log('  布局结果:');
  for (const entry of layout) {
    console.log(`    ${entry.configName} [${entry.start},${entry.end}] → 列 ${entry.column}`);
  }

  assert(colsByType.get('bold')!.size === 1,
    `两个非重叠 bold 同列: ${JSON.stringify([...colsByType.get('bold')!])}`);
}

// ============================================================
// 汇总
// ============================================================

console.log('\n==================================================');
console.log(`总计: ${passed + failed} 个测试`);
console.log(`通过: ${passed} ✅  失败: ${failed} ❌`);
console.log('==================================================');

if (failed > 0) {
  process.exit(1);
}

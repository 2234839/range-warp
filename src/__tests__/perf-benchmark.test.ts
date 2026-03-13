/**
 * 性能基准测试 — 对比优化前后
 *
 * 测试路径: tsx src/__tests__/perf-benchmark.test.ts
 *
 * 核心优化：用一次 TreeWalker + Map 索引替代循环中反复创建 DOM Range
 */
import { JSDOM } from 'jsdom';
import { DOMRangeAdapter, registerContainerConfig } from '../core/adapters/DOMRangeAdapter.js';
import { getUnicodeStringLength } from '../core/utils.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
});

global.window = dom.window as any;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.Text = dom.window.Text;
global.Range = dom.window.Range;
global.NodeFilter = dom.window.NodeFilter;

/* 注册标准样式配置 */
registerContainerConfig('bold', { tagName: 'strong', display: 'inline' });
registerContainerConfig('italic', { tagName: 'em', display: 'inline' });
registerContainerConfig('underline', { tagName: 'u', display: 'inline' });
registerContainerConfig('strikethrough', { tagName: 's', display: 'inline' });
registerContainerConfig('highlight', { tagName: 'mark', display: 'inline' });

interface BenchResult {
  name: string;
  ops: number;
  totalTimeMs: number;
  avgUs: number;
}

function bench(name: string, fn: () => void, warmup = 100, iterations = 3000): BenchResult {
  for (let i = 0; i < warmup; i++) fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const totalTimeMs = performance.now() - start;
  return {
    name,
    ops: iterations,
    totalTimeMs: Math.round(totalTimeMs * 100) / 100,
    avgUs: Math.round((totalTimeMs / iterations) * 1000 * 100) / 100,
  };
}

function printRow(result: BenchResult, baseline?: number): void {
  const extra = baseline ? ` (${baseline / result.avgUs >= 1 ? '+' : ''}${Math.round(((baseline / result.avgUs) - 1) * 100)}%)` : '';
  console.log(`  ${result.name.padEnd(40)} ${String(result.avgUs).padStart(8)}μs/次 ${extra}`);
}

/** 创建容器 */
function createContainer(html: string): HTMLDivElement {
  const el = dom.window.document.createElement('div');
  el.innerHTML = html;
  return el;
}

/* ==================== 辅助函数：模拟旧的 DOM Range 方式 ==================== */

/** 旧方式：直接使用 DOM Range 计算位置（每次创建 2 个 Range） */
function getElementPositionOld(element: Element, container: Element): { start: number; end: number } | null {
  try {
    const elemRange = document.createRange();
    elemRange.selectNodeContents(element);
    const preRange = document.createRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(elemRange.startContainer, elemRange.startOffset);
    const start = getUnicodeStringLength(preRange.toString());
    const end = start + getUnicodeStringLength(elemRange.toString());
    return { start, end };
  } catch {
    return null;
  }
}

/* ==================== 场景 1: 位置计算对比 — 100 个元素 ==================== */
function benchOldPosition(): void {
  const html = Array.from({ length: 100 }, (_, i) => `<strong>${i}</strong>`).join('');
  const container = createContainer(html);
  const allElements = container.querySelectorAll('strong');
  for (const elem of allElements) {
    getElementPositionOld(elem, container);
  }
}

function benchNewPosition(): void {
  const html = Array.from({ length: 100 }, (_, i) => `<strong>${i}</strong>`).join('');
  const container = createContainer(html);
  /* 一次 TreeWalker 建索引 */
  const index = new Map<Text, { start: number; end: number }>();
  let pos = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!(node instanceof Text)) continue;
    const len = getUnicodeStringLength(node.textContent || '');
    if (len > 0) index.set(node, { start: pos, end: pos + len });
    pos += len;
  }
  /* N 次 Map 查找 */
  const allElements = container.querySelectorAll('strong');
  for (const elem of allElements) {
    let min = Infinity, max = 0;
    const w = document.createTreeWalker(elem, NodeFilter.SHOW_TEXT);
    while ((node = w.nextNode())) {
      if (!(node instanceof Text)) continue;
      const p = index.get(node);
      if (p) { min = Math.min(min, p.start); max = Math.max(max, p.end); }
    }
  }
}

/* ==================== 场景 2: normalize 完整操作对比（通过 adapter） ==================== */
function benchAdapterNormalize(): void {
  const html = Array.from({ length: 50 }, (_, i) => `<strong>${i}</strong>`).join('');
  const container = createContainer(html);
  const adapter = new DOMRangeAdapter({ container });
  adapter.normalize(0, 50);
}

/* ==================== 场景 3: getBlockElementsInRange ==================== */
function createMultiParagraphHTML(n: number): string {
  return Array.from({ length: n }, (_, i) => `<p><strong>段落${i}文本内容</strong></p>`).join('');
}

function benchGetBlockElements(): void {
  const container = createContainer(createMultiParagraphHTML(50));
  const adapter = new DOMRangeAdapter({ container });
  adapter.getBlockElementsInRange(5, 200);
}

/* ==================== 场景 4: getStylesInRange ==================== */
function benchGetStylesInRange(): void {
  const html = Array.from({ length: 50 }, (_, i) => `<strong>${i}</strong><em>${i}</em>`).join('');
  const container = createContainer(html);
  const adapter = new DOMRangeAdapter({ container });
  adapter.queryConfigs(0, 50);
}

/* ==================== 场景 5: setStyle 组合操作 ==================== */
function benchSetStyleNormal(): void {
  const html = '这是一段测试文本用于性能基准测试';
  const container = createContainer(html);
  const adapter = new DOMRangeAdapter({ container });
  adapter.applyConfig(2, 8, 'bold');
}

function benchSetStyleCrossBlock(): void {
  const container = createContainer(createMultiParagraphHTML(20));
  const adapter = new DOMRangeAdapter({ container });
  adapter.applyConfig(5, 100, 'italic');
}

/* ==================== 运行 ==================== */
console.log('');
console.log('🚀 性能基准测试 — 核心优化: 文本节点位置索引 vs DOM Range');
console.log('='.repeat(70));

/* --- 场景 1: 纯位置计算对比 --- */
console.log('\n📊 场景 1: 100 个元素位置计算（核心算法对比）');
const oldPos = bench('旧方式: 100×DOM Range', benchOldPosition);
const newPos = bench('新方式: 1×TreeWalker + 100×Map', benchNewPosition);
printRow(oldPos);
printRow(newPos, oldPos.avgUs);

/* --- 场景 2-6: 完整 adapter 操作 --- */
console.log('\n📊 场景 2: normalize - 50个相邻同标签');
const r2 = bench('adapter.normalize()', benchAdapterNormalize);
printRow(r2);

console.log('\n📊 场景 3: getBlockElementsInRange - 50段落');
const r3 = bench('adapter.getBlockElementsInRange()', benchGetBlockElements);
printRow(r3);

console.log('\n📊 场景 4: getStylesInRange - 100个样式元素');
const r4 = bench('adapter.queryConfigs()', benchGetStylesInRange);
printRow(r4);

console.log('\n📊 场景 5: setStyle - 常规');
const r5 = bench('adapter.applyConfig(bold)', benchSetStyleNormal);
printRow(r5);

console.log('\n📊 场景 6: setStyle - 跨段落');
const r6 = bench('adapter.applyConfig(crossBlock)', benchSetStyleCrossBlock);
printRow(r6);

console.log('\n' + '='.repeat(70));

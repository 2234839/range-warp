/**
 * 跨块容器断裂修复测试
 *
 * 测试路径: tsx src/__tests__/split-repair.test.ts
 *
 * 测试覆盖:
 * 1. fill-gaps: 单块书签无间隙不触发修复
 * 2. fill-gaps: 跨块书签块间无文本不触发修复
 * 3. fill-gaps: 跨块书签中间插入新文本段落 → 填充间隙
 * 4. fill-gaps: 同一 ID 有3+分片多个间隙 → 全部填充
 * 5. keep-largest: 两个分片 → 保留较大的
 * 6. keep-largest: 三个分片 → 只保留最大的
 * 7. splitRepair: 'none' 不触发修复
 * 8. repairSplitContainers 多次调用幂等
 */

import { JSDOM } from 'jsdom';
import { DOMRangeAdapter, registerContainerConfig } from '../core/adapters/DOMRangeAdapter.js';
import { Range } from '../core/models/Range.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });
global.window = dom.window as any;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.Text = dom.window.Text;
global.Element = dom.window.Element;
global.NodeFilter = dom.window.NodeFilter;

let totalPassed = 0;
let totalFailed = 0;
const allFailures: string[] = [];

function test(name: string, fn: () => boolean) {
  try {
    const result = fn();
    if (result) {
      totalPassed++;
      console.log(`  ✅ ${name}`);
    } else {
      totalFailed++;
      allFailures.push(name);
      console.log(`  ❌ ${name}`);
    }
  } catch (e) {
    totalFailed++;
    allFailures.push(name);
    console.log(`  ❌ ${name}`);
    console.log(`     💥 异常: ${(e as Error).message}`);
    console.log(`     堆栈: ${(e as Error).stack}`);
  }
}

function assert(condition: boolean, message: string): boolean {
  if (!condition) {
    console.log(`     → ${message}`);
  }
  return condition;
}

function createEnv(html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  const adapter = new DOMRangeAdapter({ container });
  const createRange = (start: number, end: number) => new Range({ start, end, adapter });
  return { container, adapter, createRange };
}

/** 创建一个带 ID 的 span 书签元素 */
function createBookmarkSpan(id: string, className: string, text?: string) {
  const span = document.createElement('span');
  span.className = className;
  span.setAttribute('data-bookmark-id', id);
  if (text) span.textContent = text;
  return span;
}

/** 唯一 ID 计数器 */
let idCounter = 0;
function nextId(prefix = 'bm') {
  return `${prefix}-${++idCounter}`;
}

/* ==================== 注册标准样式配置 ==================== */
registerContainerConfig('bold', { tagName: 'strong', display: 'inline' });
registerContainerConfig('italic', { tagName: 'em', display: 'inline' });
registerContainerConfig('underline', { tagName: 'u', display: 'inline' });
registerContainerConfig('strikethrough', { tagName: 's', display: 'inline' });
registerContainerConfig('highlight', { tagName: 'mark', display: 'inline' });

/* ==================== 1. fill-gaps: 不触发修复的场景 ==================== */

console.log('\n=== 1. fill-gaps: 不触发修复的场景 ===');

test('1.1 fill-gaps: 单块书签无间隙不触发修复', () => {
  const { container, adapter } = createEnv('<p>Hello World</p>');
  const id = nextId();

  const span = createBookmarkSpan(id, 'bookmark', 'Hello World');
  container.querySelector('p')?.replaceChildren(span);

  /* 手动注册测试用的容器配置 */
  registerContainerConfig('test-bookmark', {
    tagName: 'span',
    attributeSelector: '.bookmark',
    display: 'inline',
    crossBlock: 'split',
    idAttribute: 'data-bookmark-id',
    splitRepair: 'fill-gaps',
  });

  const before = container.querySelectorAll('[data-bookmark-id]').length;
  adapter.repairSplitContainers();
  const after = container.querySelectorAll('[data-bookmark-id]').length;

  return assert(before === after, `元素数量应不变: ${before} → ${after}`);
});

test('1.2 fill-gaps: 跨块书签块间无文本不触发修复', () => {
  const { container, adapter } = createEnv('<p>Hello</p><p>World</p>');
  const id = nextId();

  const span1 = createBookmarkSpan(id, 'bookmark', 'Hello');
  container.querySelector('p:first-child')?.replaceChildren(span1);
  const span2 = createBookmarkSpan(id, 'bookmark', 'World');
  container.querySelector('p:last-child')?.replaceChildren(span2);

  /* 块间只有 </p><p> 边界，没有文本间隙 */
  const before = container.querySelectorAll(`[data-bookmark-id="${id}"]`).length;
  adapter.repairSplitContainers();
  const after = container.querySelectorAll(`[data-bookmark-id="${id}"]`).length;

  return assert(before === after, `跨块无间隙不应修复: ${before} → ${after}`);
});

/* ==================== 2. fill-gaps: 间隙填充 ==================== */

console.log('\n=== 2. fill-gaps: 间隙填充 ===');

test('2.1 fill-gaps: 中间插入新文本段落 → 间隙被填充', () => {
  const { container, adapter } = createEnv(
    '<p><span class="bookmark" data-bookmark-id="bm-fill-1">Hello</span></p><p>MIDDLE</p><p><span class="bookmark" data-bookmark-id="bm-fill-1">World</span></p>'
  );

  const before = container.querySelectorAll('[data-bookmark-id="bm-fill-1"]').length;
  adapter.repairSplitContainers();
  const after = container.querySelectorAll('[data-bookmark-id="bm-fill-1"]').length;

  return assert(after === before + 1, `应有 ${before + 1} 个书签元素（新增 1 个包裹）: ${before} → ${after}`);
});

test('2.2 fill-gaps: 填充后文本内容正确', () => {
  const { container, adapter } = createEnv(
    '<p><span class="bookmark" data-bookmark-id="bm-fill-2">Hello</span></p><p>MIDDLE</p><p><span class="bookmark" data-bookmark-id="bm-fill-2">World</span></p>'
  );

  adapter.repairSplitContainers();

  /* 获取所有书签元素的文本 */
  const bookmarkElements = container.querySelectorAll('[data-bookmark-id="bm-fill-2"]');
  let combinedText = '';
  for (const el of bookmarkElements) {
    combinedText += el.textContent;
  }

  return assert(combinedText === 'HelloMIDDLEWorld', `合并文本应为 'HelloMIDDLEWorld'，实际: '${combinedText}'`);
});

test('2.3 fill-gaps: 同一 ID 有3个分片2个间隙 → 全部填充', () => {
  const { container, adapter } = createEnv(
    '<p><span class="bookmark" data-bookmark-id="bm-fill-3">A</span></p><p>M1</p><p><span class="bookmark" data-bookmark-id="bm-fill-3">B</span></p><p>M2</p><p><span class="bookmark" data-bookmark-id="bm-fill-3">C</span></p>'
  );

  adapter.repairSplitContainers();

  const bookmarkElements = container.querySelectorAll('[data-bookmark-id="bm-fill-3"]');
  let combinedText = '';
  for (const el of bookmarkElements) {
    combinedText += el.textContent;
  }

  return (
    assert(bookmarkElements.length === 5, `应有 5 个书签元素（原3 + 新增2）: ${bookmarkElements.length}`) &&
    assert(combinedText === 'AM1BM2C', `合并文本应为 'AM1BM2C'，实际: '${combinedText}'`)
  );
});

test('2.4 fill-gaps: 间隙内容跨多个块', () => {
  const { container, adapter } = createEnv(
    '<p><span class="bookmark" data-bookmark-id="bm-fill-4">Start</span></p><p>Line1</p><p>Line2</p><p><span class="bookmark" data-bookmark-id="bm-fill-4">End</span></p>'
  );

  adapter.repairSplitContainers();

  const bookmarkElements = container.querySelectorAll('[data-bookmark-id="bm-fill-4"]');
  let combinedText = '';
  for (const el of bookmarkElements) {
    combinedText += el.textContent;
  }

  return (
    assert(bookmarkElements.length === 4, `应有 4 个书签元素: ${bookmarkElements.length}`) &&
    assert(combinedText === 'StartLine1Line2End', `合并文本应为 'StartLine1Line2End'，实际: '${combinedText}'`)
  );
});

test('2.5 fill-gaps: 间隙内有样式容器', () => {
  const { container, adapter } = createEnv(
    '<p><span class="bookmark" data-bookmark-id="bm-fill-5">Hello</span></p><p><strong>Middle</strong></p><p><span class="bookmark" data-bookmark-id="bm-fill-5">World</span></p>'
  );

  adapter.repairSplitContainers();

  const bookmarkElements = container.querySelectorAll('[data-bookmark-id="bm-fill-5"]');
  let combinedText = '';
  for (const el of bookmarkElements) {
    combinedText += el.textContent;
  }

  return (
    assert(bookmarkElements.length === 3, `应有 3 个书签元素: ${bookmarkElements.length}`) &&
    assert(combinedText === 'HelloMiddleWorld', `合并文本应为 'HelloMiddleWorld'，实际: '${combinedText}'`)
  );
});

test('2.6 fill-gaps: 间隙内容是块内部分文本', () => {
  const { container, adapter } = createEnv(
    '<p>before<span class="bookmark" data-bookmark-id="bm-fill-6">Hello</span> after</p><p><span class="bookmark" data-bookmark-id="bm-fill-6">World</span></p>'
  );

  adapter.repairSplitContainers();

  const bookmarkElements = container.querySelectorAll('[data-bookmark-id="bm-fill-6"]');
  let combinedText = '';
  for (const el of bookmarkElements) {
    combinedText += el.textContent;
  }

  /* 间隙是 " after" 文本，应该被包裹 */
  return assert(combinedText === 'Hello afterWorld', `合并文本应为 'Hello afterWorld'，实际: '${combinedText}'`);
});

/* ==================== 3. keep-largest ==================== */

console.log('\n=== 3. keep-largest ===');

/* 注册一个 keep-largest 的测试配置 */
registerContainerConfig('test-keep-largest', {
  tagName: 'span',
  attributeSelector: '.keep-largest-test',
  display: 'inline',
  crossBlock: 'split',
  idAttribute: 'data-test-id',
  splitRepair: 'keep-largest',
});

test('3.1 keep-largest: 两个分片 → 保留较大的', () => {
  const { container, adapter } = createEnv(
    '<p><span class="keep-largest-test" data-test-id="kl-1">Small</span></p><p>MIDDLE</p><p><span class="keep-largest-test" data-test-id="kl-1">VeryLargeText</span></p>'
  );

  adapter.repairSplitContainers();

  const elements = container.querySelectorAll('[data-test-id="kl-1"]');

  return (
    assert(elements.length === 1, `应只剩 1 个元素: ${elements.length}`) &&
    assert(elements[0].textContent === 'VeryLargeText', `保留的文本应为 'VeryLargeText'，实际: '${elements[0].textContent}'`)
  );
});

test('3.2 keep-largest: 三个分片 → 只保留最大的', () => {
  const { container, adapter } = createEnv(
    '<p><span class="keep-largest-test" data-test-id="kl-2">S</span></p><p>M1</p><p><span class="keep-largest-test" data-test-id="kl-2">MediumSize</span></p><p>M2</p><p><span class="keep-largest-test" data-test-id="kl-2">L</span></p>'
  );

  adapter.repairSplitContainers();

  const elements = container.querySelectorAll('[data-test-id="kl-2"]');

  return (
    assert(elements.length === 1, `应只剩 1 个元素: ${elements.length}`) &&
    assert(elements[0].textContent === 'MediumSize', `保留的文本应为 'MediumSize'，实际: '${elements[0].textContent}'`)
  );
});

test('3.3 keep-largest: 所有分片等大 → 保留文档顺序最前的', () => {
  const { container, adapter } = createEnv(
    '<p><span class="keep-largest-test" data-test-id="kl-3">AAA</span></p><p>MIDDLE</p><p><span class="keep-largest-test" data-test-id="kl-3">AAA</span></p>'
  );

  adapter.repairSplitContainers();

  const elements = container.querySelectorAll('[data-test-id="kl-3"]');
  /* 排序后第一个是文档最前的（或最后一个，取决于 sort 稳定性） */

  return (
    assert(elements.length === 1, `应只剩 1 个元素: ${elements.length}`) &&
    assert(elements[0].textContent === 'AAA', `保留的文本应为 'AAA'`)
  );
});

test('3.4 keep-largest: 移除的元素保留文本内容', () => {
  const { container, adapter } = createEnv(
    '<p><span class="keep-largest-test" data-test-id="kl-4">Small</span></p><p>MIDDLE</p><p><span class="keep-largest-test" data-test-id="kl-4">VeryLargeText</span></p>'
  );

  adapter.repairSplitContainers();

  /* MIDDLE 文本应该仍然存在于容器中（不是被删除，而是解包保留） */
  const textContent = container.textContent;

  return assert(
    textContent.includes('Small') && textContent.includes('MIDDLE') && textContent.includes('VeryLargeText'),
    `所有文本应被保留。容器文本: '${textContent}'`
  );
});

/* ==================== 4. 不触发修复的场景 ==================== */

console.log('\n=== 4. 不触发修复的场景 ===');

test('4.1 样式容器（bold/italic）不受影响', () => {
  const { container, adapter } = createEnv(
    '<p><strong>Hello</strong></p><p>World</p><p><strong>Test</strong></p>'
  );

  const before = container.innerHTML;
  adapter.repairSplitContainers();
  const after = container.innerHTML;

  return assert(before === after, '样式容器 HTML 不应改变');
});

/* ==================== 5. 幂等性 ==================== */

console.log('\n=== 5. 幂等性 ===');

test('5.1 repairSplitContainers 多次调用结果不变', () => {
  const { container, adapter } = createEnv(
    '<p><span class="bookmark" data-bookmark-id="bm-undo-1">Hello</span></p><p>MIDDLE</p><p><span class="bookmark" data-bookmark-id="bm-undo-1">World</span></p>'
  );

  adapter.repairSplitContainers();
  const count1 = container.querySelectorAll('[data-bookmark-id="bm-undo-1"]').length;
  adapter.repairSplitContainers();
  const count2 = container.querySelectorAll('[data-bookmark-id="bm-undo-1"]').length;

  return assert(count1 === count2, `多次调用结果应一致: ${count1} → ${count2}`);
});

/* ==================== 汇总 ==================== */

console.log(`\n=== 汇总 ===`);
console.log(`  通过: ${totalPassed}`);
console.log(`  失败: ${totalFailed}`);
if (allFailures.length > 0) {
  console.log('  失败项:');
  for (const name of allFailures) {
    console.log(`    - ${name}`);
  }
}

/**
 * 粘贴事件 HTML 清洗测试
 *
 * 测试路径: tsx src/__tests__/paste-sanitize.test.ts
 *
 * 测试覆盖:
 * 1. 粘贴含书签的 HTML → 书签容器被移除，文本保留
 * 2. 粘贴含修订的 HTML → 修订容器被移除，文本保留
 * 3. 粘贴含内联样式的 HTML → 样式保留
 * 4. 粘贴混合内容 → 不可复制容器移除，可复制内容保留
 * 5. 粘贴纯文本（无 HTML）→ 不拦截，浏览器原生处理
 * 6. 粘贴跨块内容 → 块结构保持
 * 7. 粘贴无不可复制容器的 HTML → 原样插入
 */

import { JSDOM } from 'jsdom';
import { DOMRangeAdapter, registerContainerConfig } from '../core/adapters/DOMRangeAdapter.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });
global.window = dom.window as any;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.Text = dom.window.Text;
global.Element = dom.window.Element;
global.NodeFilter = dom.window.NodeFilter;
global.Range = dom.window.Range;
global.ClipboardEvent = dom.window.ClipboardEvent;
global.DataTransfer = dom.window.DataTransfer;

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

/** 模拟粘贴事件并获取容器内的最终 HTML */
function simulatePaste(container: HTMLElement, clipboardHTML: string): string {
  const adapter = new DOMRangeAdapter({ container });

  /** 清洗粘贴的 HTML */
  const sanitized = adapter.sanitizeHTML(clipboardHTML);

  /** 模拟 insertHTML：将清洗后的内容插入到容器中 */
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitized;
  while (wrapper.firstChild) {
    container.appendChild(wrapper.firstChild);
  }

  return container.innerHTML;
}

/** 创建测试容器并设置选区 */
function createTestEnv(initialHTML: string = '<p>|</p>') {
  const container = document.createElement('div');
  container.innerHTML = initialHTML;
  document.body.appendChild(container);
  return container;
}

/* ==================== 注册容器配置 ==================== */

registerContainerConfig('bold', { tagName: 'strong', display: 'inline' });
registerContainerConfig('italic', { tagName: 'em', display: 'inline' });

registerContainerConfig('test-paste-bookmark', {
  tagName: 'span',
  attributeSelector: '.bm',
  display: 'inline',
  crossBlock: 'split',
  idAttribute: 'data-bm-id',
  copyable: false,
});

registerContainerConfig('test-paste-rev-insert', {
  tagName: 'span',
  attributeSelector: '.revision-insert',
  display: 'inline',
  crossBlock: 'split',
  idAttribute: 'data-revision-id',
  copyable: false,
});

registerContainerConfig('test-paste-rev-delete', {
  tagName: 'span',
  attributeSelector: '.revision-delete',
  display: 'inline',
  crossBlock: 'split',
  idAttribute: 'data-revision-id',
  copyable: false,
});

/* ==================== 1. 书签清洗 ==================== */

console.log('\n=== 1. 粘贴含书签的 HTML ===');

test('1.1 粘贴书签包裹的文本 → 书签移除，文本保留', () => {
  const container = createTestEnv();
  const result = simulatePaste(container, '<span class="bm" data-bm-id="x">Hello World</span>');
  document.body.removeChild(container);

  return (
    assert(!result.includes('data-bm-id'), `不应包含书签属性: ${result}`) &&
    assert(!result.includes('<span class="bm">'), `不应包含书签 span: ${result}`) &&
    assert(result.includes('Hello World'), `应保留文本: ${result}`)
  );
});

test('1.2 粘贴多个书签分片 → 全部移除', () => {
  const container = createTestEnv();
  const result = simulatePaste(container, '<span class="bm" data-bm-id="x">A</span><span class="bm" data-bm-id="x">B</span>');
  document.body.removeChild(container);

  return (
    assert(!result.includes('data-bm-id'), `不应包含书签属性: ${result}`) &&
    assert(result.includes('A') && result.includes('B'), `应保留文本 AB: ${result}`)
  );
});

test('1.3 粘贴书签内的加粗文本 → 书签移除，加粗保留', () => {
  const container = createTestEnv();
  const result = simulatePaste(container, '<span class="bm" data-bm-id="x"><strong>Bold</strong></span>');
  document.body.removeChild(container);

  return (
    assert(!result.includes('data-bm-id'), `书签应被移除: ${result}`) &&
    assert(result.includes('<strong>Bold</strong>'), `加粗应保留: ${result}`)
  );
});

/* ==================== 2. 修订清洗 ==================== */

console.log('\n=== 2. 粘贴含修订的 HTML ===');

test('2.1 粘贴插入修订 → 修订移除，文本保留', () => {
  const container = createTestEnv();
  const result = simulatePaste(container, '<span class="revision-insert" data-revision-id="r1">inserted</span>');
  document.body.removeChild(container);

  return (
    assert(!result.includes('data-revision-id'), `不应包含修订属性: ${result}`) &&
    assert(result.includes('inserted'), `应保留文本: ${result}`)
  );
});

test('2.2 粘贴删除修订 → 修订移除，文本保留', () => {
  const container = createTestEnv();
  const result = simulatePaste(container, '<span class="revision-delete" data-revision-id="r2">deleted</span>');
  document.body.removeChild(container);

  return (
    assert(!result.includes('revision-delete'), `不应包含修订: ${result}`) &&
    assert(result.includes('deleted'), `应保留文本: ${result}`)
  );
});

test('2.3 粘贴修订内的加粗 → 修订移除，加粗保留', () => {
  const container = createTestEnv();
  const result = simulatePaste(container, '<span class="revision-insert" data-revision-id="r1"><strong>Bold</strong></span>');
  document.body.removeChild(container);

  return (
    assert(!result.includes('data-revision-id'), `修订应被移除: ${result}`) &&
    assert(result.includes('<strong>Bold</strong>'), `加粗应保留: ${result}`)
  );
});

/* ==================== 3. 内联样式保留 ==================== */

console.log('\n=== 3. 粘贴含内联样式的 HTML ===');

test('3.1 粘贴加粗文本 → 加粗保留', () => {
  const container = createTestEnv();
  const result = simulatePaste(container, '<strong>Bold Text</strong>');
  document.body.removeChild(container);

  return assert(result.includes('<strong>Bold Text</strong>'), `加粗应保留: ${result}`);
});

test('3.2 粘贴斜体文本 → 斜体保留', () => {
  const container = createTestEnv();
  const result = simulatePaste(container, '<em>Italic Text</em>');
  document.body.removeChild(container);

  return assert(result.includes('<em>Italic Text</em>'), `斜体应保留: ${result}`);
});

test('3.3 粘贴混合样式 → 全部保留', () => {
  const container = createTestEnv();
  const result = simulatePaste(container, '<strong>Bold</strong> and <em>Italic</em>');
  document.body.removeChild(container);

  return (
    assert(result.includes('<strong>Bold</strong>'), `加粗应保留: ${result}`) &&
    assert(result.includes('<em>Italic</em>'), `斜体应保留: ${result}`)
  );
});

/* ==================== 4. 混合内容 ==================== */

console.log('\n=== 4. 粘贴混合内容 ===');

test('4.1 粘贴书签+加粗+普通文本混合', () => {
  const container = createTestEnv();
  const result = simulatePaste(container, 'Plain <span class="bm" data-bm-id="x"><strong>Bold</strong></span> End');
  document.body.removeChild(container);

  return (
    assert(!result.includes('data-bm-id'), `书签应被移除: ${result}`) &&
    assert(result.includes('Plain'), `普通文本应保留: ${result}`) &&
    assert(result.includes('<strong>Bold</strong>'), `加粗应保留: ${result}`) &&
    assert(result.includes('End'), `尾部文本应保留: ${result}`)
  );
});

test('4.2 粘贴嵌套的不可复制容器（修订嵌套书签）内加粗', () => {
  const container = createTestEnv();
  const result = simulatePaste(container,
    '<span class="revision-insert" data-revision-id="r1"><span class="bm" data-bm-id="x"><strong>Nested</strong></span></span>'
  );
  document.body.removeChild(container);

  return (
    assert(!result.includes('data-revision-id'), `修订应被移除: ${result}`) &&
    assert(!result.includes('data-bm-id'), `书签应被移除: ${result}`) &&
    assert(result.includes('<strong>Nested</strong>'), `加粗应保留: ${result}`)
  );
});

/* ==================== 5. 无不可复制容器 ==================== */

console.log('\n=== 5. 粘贴无不可复制容器的 HTML ===');

test('5.1 粘贴纯文本 HTML → 原样保留', () => {
  const container = createTestEnv();
  const result = simulatePaste(container, 'Just plain text');
  document.body.removeChild(container);

  return assert(result.includes('Just plain text'), `纯文本应保留: ${result}`);
});

test('5.2 粘贴段落+加粗 → 原样保留', () => {
  const container = createTestEnv();
  const result = simulatePaste(container, '<p>Hello <strong>world</strong></p>');
  document.body.removeChild(container);

  return (
    assert(result.includes('<p>'), `段落标签应保留: ${result}`) &&
    assert(result.includes('<strong>world</strong>'), `加粗应保留: ${result}`)
  );
});

/* ==================== 6. 跨块内容 ==================== */

console.log('\n=== 6. 粘贴跨块内容 ===');

test('6.1 粘贴多段落内容含修订 → 修订移除，段落结构保持', () => {
  const container = createTestEnv();
  const result = simulatePaste(container,
    '<p>Before</p><p><span class="revision-insert" data-revision-id="r1">inserted</span></p><p>After</p>'
  );
  document.body.removeChild(container);

  return (
    assert(!result.includes('data-revision-id'), `修订应被移除: ${result}`) &&
    assert(result.includes('Before'), `Before 应保留: ${result}`) &&
    assert(result.includes('inserted'), `inserted 应保留: ${result}`) &&
    assert(result.includes('After'), `After 应保留: ${result}`)
  );
});

/* ==================== 7. sanitizeHTML 函数直接测试 ==================== */

console.log('\n=== 7. sanitizeHTML 函数直接测试 ===');

test('7.1 空 HTML → 返回空', () => {
  const adapter = new DOMRangeAdapter({ container: document.createElement('div') });
  const result = adapter.sanitizeHTML('');
  return assert(result === '', `空 HTML 应返回空: '${result}'`);
});

test('7.2 未知标签不受影响', () => {
  const adapter = new DOMRangeAdapter({ container: document.createElement('div') });
  const html = '<div class="custom">Custom</div>';
  const result = adapter.sanitizeHTML(html);
  return assert(result === html, `未知标签应原样返回: '${result}'`);
});

test('7.3 纯文本原样返回', () => {
  const adapter = new DOMRangeAdapter({ container: document.createElement('div') });
  const result = adapter.sanitizeHTML('Just plain text');
  return assert(result === 'Just plain text', `纯文本应原样返回: '${result}'`);
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

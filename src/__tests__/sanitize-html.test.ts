/**
 * 剪贴板 HTML 清洗测试
 *
 * 测试路径: tsx src/__tests__/sanitize-html.test.ts
 *
 * 测试覆盖:
 * 1. 不可复制容器（书签）被移除，文本保留
 * 2. 不可复制容器（修订）被移除，文本保留
 * 3. 内部子容器（加粗、斜体等）被保留
 * 4. 可复制容器（加粗等样式）不受影响
 * 5. 多层嵌套场景
 * 6. 空 HTML 不报错
 * 7. 无不可复制容器的 HTML 原样返回
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

/** 创建适配器（仅用于 sanitizeHTML，不需要容器） */
function createAdapter() {
  const container = document.createElement('div');
  return new DOMRangeAdapter({ container });
}

/* ==================== 注册测试容器配置 ==================== */

/* 注册标准样式配置 */
registerContainerConfig('bold', { tagName: 'strong', display: 'inline' });
registerContainerConfig('italic', { tagName: 'em', display: 'inline' });
registerContainerConfig('underline', { tagName: 'u', display: 'inline' });
registerContainerConfig('strikethrough', { tagName: 's', display: 'inline' });
registerContainerConfig('highlight', { tagName: 'mark', display: 'inline' });

/* 注册书签：不可复制 */
registerContainerConfig('test-sanitize-bookmark', {
  tagName: 'span',
  attributeSelector: '.bm',
  display: 'inline',
  crossBlock: 'split',
  idAttribute: 'data-bm-id',
  copyable: false,
});

/* 注册修订：不可复制 */
registerContainerConfig('test-sanitize-rev-insert', {
  tagName: 'span',
  attributeSelector: '.rev-ins',
  display: 'inline',
  crossBlock: 'split',
  idAttribute: 'data-rev-id',
  copyable: false,
});
registerContainerConfig('test-sanitize-rev-delete', {
  tagName: 'span',
  attributeSelector: '.rev-del',
  display: 'inline',
  crossBlock: 'split',
  idAttribute: 'data-rev-id',
  copyable: false,
});

/* 注册样式：可复制（默认） */
registerContainerConfig('test-sanitize-bold', {
  tagName: 'strong',
  display: 'inline',
});

/* ==================== 1. 书签清洗 ==================== */

console.log('\n=== 1. 书签清洗 ===');

test('1.1 书签容器被移除，纯文本保留', () => {
  const adapter = createAdapter();
  const html = '<span class="bm" data-bm-id="x">Hello World</span>';
  const result = adapter.sanitizeHTML(html);

  return (
    assert(!result.includes('data-bm-id'), `不应包含书签属性: ${result}`) &&
    assert(result.includes('Hello World'), `应保留文本: ${result}`) &&
    assert(!result.includes('<span'), `不应包含 span 标签: ${result}`)
  );
});

test('1.2 多个书签分片都被移除', () => {
  const adapter = createAdapter();
  const html = '<span class="bm" data-bm-id="x">Hello</span> MIDDLE <span class="bm" data-bm-id="x">World</span>';
  const result = adapter.sanitizeHTML(html);

  return (
    assert(!result.includes('data-bm-id'), `不应包含书签属性: ${result}`) &&
    assert(result.includes('Hello MIDDLE World'), `文本应完整保留: ${result}`)
  );
});

/* ==================== 2. 修订清洗 ==================== */

console.log('\n=== 2. 修订清洗 ===');

test('2.1 插入修订被移除，文本保留', () => {
  const adapter = createAdapter();
  const html = '<span class="rev-ins" data-rev-id="r1">inserted text</span>';
  const result = adapter.sanitizeHTML(html);

  return (
    assert(!result.includes('data-rev-id'), `不应包含修订属性: ${result}`) &&
    assert(result.includes('inserted text'), `应保留文本: ${result}`)
  );
});

test('2.2 删除修订被移除，文本保留', () => {
  const adapter = createAdapter();
  const html = '<span class="rev-del" data-rev-id="r2">deleted text</span>';
  const result = adapter.sanitizeHTML(html);

  return (
    assert(!result.includes('data-rev-id'), `不应包含修订属性: ${result}`) &&
    assert(result.includes('deleted text'), `应保留文本: ${result}`)
  );
});

/* ==================== 3. 内部子容器保留 ==================== */

console.log('\n=== 3. 内部子容器保留 ===');

test('3.1 书签内的加粗文本保留 strong 标签', () => {
  const adapter = createAdapter();
  const html = '<span class="bm" data-bm-id="x"><strong>Bold Text</strong></span>';
  const result = adapter.sanitizeHTML(html);

  return (
    assert(!result.includes('data-bm-id'), `书签标签应被移除: ${result}`) &&
    assert(result.includes('<strong>Bold Text</strong>'), `加粗标签应保留: ${result}`)
  );
});

test('3.2 书签内多种样式嵌套保留', () => {
  const adapter = createAdapter();
  const html = '<span class="bm" data-bm-id="x"><strong>Bold</strong> and <em>Italic</em></span>';
  const result = adapter.sanitizeHTML(html);

  return (
    assert(!result.includes('data-bm-id'), `书签标签应被移除: ${result}`) &&
    assert(result.includes('<strong>Bold</strong>'), `加粗应保留: ${result}`) &&
    assert(result.includes('<em>Italic</em>'), `斜体应保留: ${result}`)
  );
});

test('3.3 修订内的加粗文本保留', () => {
  const adapter = createAdapter();
  const html = '<span class="rev-ins" data-rev-id="r1"><strong>New Bold</strong></span>';
  const result = adapter.sanitizeHTML(html);

  return (
    assert(!result.includes('data-rev-id'), `修订标签应被移除: ${result}`) &&
    assert(result.includes('<strong>New Bold</strong>'), `加粗应保留: ${result}`)
  );
});

/* ==================== 4. 可复制容器不受影响 ==================== */

console.log('\n=== 4. 可复制容器不受影响 ===');

test('4.1 独立的加粗标签原样保留', () => {
  const adapter = createAdapter();
  const html = '<strong>Bold Text</strong>';
  const result = adapter.sanitizeHTML(html);

  return assert(result === '<strong>Bold Text</strong>', `应原样返回: ${result}`);
});

test('4.2 加粗和斜体混合标签原样保留', () => {
  const adapter = createAdapter();
  const html = '<strong>Bold</strong> and <em>Italic</em>';
  const result = adapter.sanitizeHTML(html);

  return assert(result === '<strong>Bold</strong> and <em>Italic</em>', `应原样返回: ${result}`);
});

/* ==================== 5. 混合场景 ==================== */

console.log('\n=== 5. 混合场景 ===');

test('5.1 书签+加粗+普通文本混合', () => {
  const adapter = createAdapter();
  const html = 'Plain <span class="bm" data-bm-id="x">Bookmarked <strong>Bold</strong></span> End';
  const result = adapter.sanitizeHTML(html);

  return (
    assert(!result.includes('data-bm-id'), `书签标签应被移除: ${result}`) &&
    assert(result.includes('Plain'), `普通文本应保留: ${result}`) &&
    assert(result.includes('<strong>Bold</strong>'), `加粗应保留: ${result}`) &&
    assert(result.includes('End'), `尾部文本应保留: ${result}`)
  );
});

test('5.2 同一文本既有书签又有修订', () => {
  const adapter = createAdapter();
  const html = '<span class="bm" data-bm-id="x"><span class="rev-ins" data-rev-id="r1">Text</span></span>';
  const result = adapter.sanitizeHTML(html);

  return (
    assert(!result.includes('data-bm-id'), `书签标签应被移除: ${result}`) &&
    assert(!result.includes('data-rev-id'), `修订标签应被移除: ${result}`) &&
    assert(result.includes('Text'), `文本应保留: ${result}`)
  );
});

test('5.3 段落结构保持', () => {
  const adapter = createAdapter();
  const html = '<p>Hello <span class="bm" data-bm-id="x">World</span></p>';
  const result = adapter.sanitizeHTML(html);

  return (
    assert(result.includes('<p>'), `段落标签应保留: ${result}`) &&
    assert(!result.includes('data-bm-id'), `书签标签应被移除: ${result}`) &&
    assert(result.includes('Hello World'), `文本应完整: ${result}`)
  );
});

/* ==================== 6. 边界场景 ==================== */

console.log('\n=== 6. 边界场景 ===');

test('6.1 空 HTML 返回空', () => {
  const adapter = createAdapter();
  const result = adapter.sanitizeHTML('');
  return assert(result === '', `空 HTML 应返回空: '${result}'`);
});

test('6.2 纯文本原样返回', () => {
  const adapter = createAdapter();
  const result = adapter.sanitizeHTML('Just plain text');
  return assert(result === 'Just plain text', `纯文本应原样返回: '${result}'`);
});

test('6.3 未知标签不受影响', () => {
  const adapter = createAdapter();
  const html = '<div class="custom">Custom</div>';
  const result = adapter.sanitizeHTML(html);
  return assert(result === html, `未知标签应原样返回: '${result}'`);
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

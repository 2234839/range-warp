/**
 * 复制/剪切事件清洗测试
 *
 * 测试路径: tsx src/__tests__/copy-cut.test.ts
 *
 * 核心场景：
 * 1. cloneContents() 的序列化行为（含/不含格式化祖先）
 * 2. sanitizeHTML 对不同 HTML 结构的处理
 * 3. 格式化祖先恢复（getFormattingAncestors + wrapWithMissingFormatting）
 * 4. 端到端：模拟完整 handleCopyCut 流程
 * 5. 边界场景（嵌套、空选区、混合标记等）
 */

import { JSDOM } from 'jsdom';
import { DOMRangeAdapter, registerContainerConfig, getNonCopyableSelector } from '../core/adapters/DOMRangeAdapter.js';
import { getFormattingAncestors, wrapWithMissingFormatting } from '../components/editor-utils.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });
global.window = dom.window as any;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.Text = dom.window.Text;
global.Element = dom.window.Element;
global.NodeFilter = dom.window.NodeFilter;
global.Range = dom.window.Range;

/* ==================== 辅助工具 ==================== */

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

/**
 * 在 body 中创建容器并解析 HTML，用于测试
 */
function createTestContainer(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

/**
 * 设置选区到指定文本节点
 */
function selectTextNode(container: HTMLElement, cssSelector: string, startOffset: number, endOffset: number): Range {
  const el = container.querySelector(cssSelector);
  if (!el) throw new Error(`Element not found: ${cssSelector}`);
  const textNode = el.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) throw new Error(`No text node in: ${cssSelector}`);
  const range = document.createRange();
  range.setStart(textNode, startOffset);
  range.setEnd(textNode, endOffset);
  return range;
}

/**
 * 设置选区跨越元素的全部子节点
 */
function selectElementContent(container: HTMLElement, cssSelector: string): Range {
  const el = container.querySelector(cssSelector);
  if (!el) throw new Error(`Element not found: ${cssSelector}`);
  const range = document.createRange();
  range.setStart(el, 0);
  range.setEnd(el, el.childNodes.length);
  return range;
}

/**
 * 模拟 handleCopyCut 完整流程：cloneContents → sanitizeHTML → 恢复格式化祖先
 */
function simulateCopy(container: HTMLElement, range: Range): string {
  const adapter = new DOMRangeAdapter({ container });

  /** 步骤1: cloneContents */
  const fragment = range.cloneContents();
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment);
  const clonedHTML = wrapper.innerHTML;

  /** 步骤2: sanitizeHTML */
  const sanitizedHTML = adapter.sanitizeHTML(clonedHTML);

  /** 步骤3: 恢复格式化祖先 */
  const nonCopyableSelector = getNonCopyableSelector();
  const ancestors = getFormattingAncestors(range, container, nonCopyableSelector);
  const finalHTML = ancestors.length > 0
    ? wrapWithMissingFormatting(sanitizedHTML, ancestors)
    : sanitizedHTML;

  return finalHTML;
}

/**
 * 断言剪贴板 HTML 包含指定标签包裹的文本
 */
function assertContainsTagged(html: string, tag: string, text: string): boolean {
  return assert(html.includes(`<${tag}>${text}</${tag}>`) || html.includes(`<${tag} >${text}</${tag}>`),
    `HTML 应包含 <${tag}>${text}</${tag}>，实际: ${html}`);
}

/**
 * 断言剪贴板 HTML 不包含指定属性
 */
function assertNotContains(html: string, ...substrings: string[]): boolean {
  return substrings.every(s => assert(!html.includes(s), `HTML 不应包含 "${s}"，实际: ${html}`));
}

/* ==================== 注册容器配置 ==================== */

/* 注册标准样式配置 */
registerContainerConfig('bold', { tagName: 'strong', display: 'inline' });
registerContainerConfig('italic', { tagName: 'em', display: 'inline' });
registerContainerConfig('underline', { tagName: 'u', display: 'inline' });
registerContainerConfig('strikethrough', { tagName: 's', display: 'inline' });
registerContainerConfig('highlight', { tagName: 'mark', display: 'inline' });

registerContainerConfig('test-rev-insert', {
  tagName: 'span',
  attributeSelector: '.revision-insert',
  display: 'inline',
  crossBlock: 'split',
  idAttribute: 'data-revision-id',
  copyable: false,
});
registerContainerConfig('test-rev-delete', {
  tagName: 'span',
  attributeSelector: '.revision-delete',
  display: 'inline',
  crossBlock: 'split',
  idAttribute: 'data-revision-id',
  copyable: false,
});
registerContainerConfig('test-bookmark', {
  tagName: 'span',
  attributeSelector: '.bm',
  display: 'inline',
  crossBlock: 'split',
  idAttribute: 'data-bm-id',
  copyable: false,
});

/* ==================== 1. cloneContents() 序列化行为 ==================== */

console.log('\n=== 1. range.cloneContents() 序列化行为 ===');

test('1.1 选区在单个文本节点内 → cloneContents 不包含父级 strong', () => {
  const container = createTestContainer('<p><strong>Hello</strong></p>');
  const range = selectTextNode(container, 'strong', 0, 5);
  const fragment = range.cloneContents();
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment);
  document.body.removeChild(container);

  return assert(wrapper.innerHTML === 'Hello', `纯文本节点选区不应包含父级标签，实际: ${wrapper.innerHTML}`);
});

test('1.2 选区在单个文本节点内 → cloneContents 不包含多层父级', () => {
  const container = createTestContainer('<p><em><strong>BoldItalic</strong></em></p>');
  const range = selectTextNode(container, 'strong', 0, 10);
  const fragment = range.cloneContents();
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment);
  document.body.removeChild(container);

  return assert(wrapper.innerHTML === 'BoldItalic',
    `嵌套标签内选区不应包含任何父级标签，实际: ${wrapper.innerHTML}`);
});

test('1.3 选区在 修订>bold 内的文本节点 → cloneContents 不包含任何父级标签', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1"><strong>8F</strong></span></p>'
  );
  const range = selectTextNode(container, 'strong', 0, 2);
  const fragment = range.cloneContents();
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment);
  document.body.removeChild(container);

  /** JSDOM 的 cloneContents() 在选区完全在文本节点内时不包含任何父级标签（per DOM spec） */
  return assert(wrapper.innerHTML === '8F',
    `纯文本节点选区不应包含任何父级标签，实际: ${wrapper.innerHTML}`);
});

test('1.4 选区覆盖整个子元素 → cloneContents 包含该子元素', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1">7<strong>8F</strong></span></p>'
  );
  const range = selectElementContent(container, '.revision-insert');
  const fragment = range.cloneContents();
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment);
  document.body.removeChild(container);

  const html = wrapper.innerHTML;
  return assert(html.includes('<strong>8F</strong>'), `应包含 strong: ${html}`)
    && assert(html.includes('7'), `应包含文本 "7": ${html}`);
});

test('1.5 选区跨块级元素 → cloneContents 包含块结构', () => {
  const container = createTestContainer('<p>first</p><p>second</p>');
  const p1 = container.querySelector('p:first-child')!;
  const p2 = container.querySelector('p:last-child')!;
  const range = document.createRange();
  range.setStart(p1.firstChild!, 2);
  range.setEnd(p2.firstChild!, 3);
  const fragment = range.cloneContents();
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment);
  document.body.removeChild(container);

  return assert(wrapper.querySelectorAll('p').length === 2,
    `跨块选区应包含两个 p 标签，实际: ${wrapper.innerHTML}`);
});

/* ==================== 2. getFormattingAncestors 行为 ==================== */

console.log('\n=== 2. getFormattingAncestors 行为 ===');

test('2.1 选区在 strong 内 → 找到 strong 作为格式化祖先', () => {
  const container = createTestContainer('<p><strong>bold</strong></p>');
  const range = selectTextNode(container, 'strong', 0, 4);
  const ancestors = getFormattingAncestors(range, container, getNonCopyableSelector());
  document.body.removeChild(container);

  return assert(ancestors.length === 1, `应有 1 个祖先，实际 ${ancestors.length}`)
    && assert(ancestors[0].tagName.toLowerCase() === 'strong', `应为 strong，实际 ${ancestors[0].tagName}`);
});

test('2.2 选区在 em>strong 嵌套内 → 找到 strong 和 em', () => {
  const container = createTestContainer('<p><em><strong>nested</strong></em></p>');
  const range = selectTextNode(container, 'strong', 0, 6);
  const ancestors = getFormattingAncestors(range, container, getNonCopyableSelector());
  document.body.removeChild(container);

  return assert(ancestors.length === 2, `应有 2 个祖先，实际 ${ancestors.length}`)
    && assert(ancestors[0].tagName.toLowerCase() === 'strong', `第1个应为 strong`)
    && assert(ancestors[1].tagName.toLowerCase() === 'em', `第2个应为 em`);
});

test('2.3 选区在 修订>strong 内 → 跳过修订，找到 strong', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1"><strong>text</strong></span></p>'
  );
  const range = selectTextNode(container, 'strong', 0, 4);
  const ancestors = getFormattingAncestors(range, container, getNonCopyableSelector());
  document.body.removeChild(container);

  return assert(ancestors.length === 1, `应有 1 个祖先（跳过修订），实际 ${ancestors.length}`)
    && assert(ancestors[0].tagName.toLowerCase() === 'strong', `应为 strong`);
});

test('2.4 选区在 修订>纯文本 内 → 无格式化祖先', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1">plain</span></p>'
  );
  const range = selectTextNode(container, '.revision-insert', 0, 5);
  const ancestors = getFormattingAncestors(range, container, getNonCopyableSelector());
  document.body.removeChild(container);

  return assert(ancestors.length === 0, `修订内纯文本不应有格式化祖先，实际 ${ancestors.length}`);
});

test('2.5 选区在 p>strong 内 → 遇到块级元素停止', () => {
  const container = createTestContainer('<div><p><strong>text</strong></p></div>');
  const range = selectTextNode(container, 'strong', 0, 4);
  const ancestors = getFormattingAncestors(range, container, getNonCopyableSelector());
  document.body.removeChild(container);

  return assert(ancestors.length === 1, `应只有 strong（p 是块级停止），实际 ${ancestors.length}`)
    && assert(ancestors[0].tagName.toLowerCase() === 'strong', `应为 strong`);
});

test('2.6 选区在 修订>em>strong 三层嵌套内 → 跳过修订，找到 em 和 strong', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1"><em><strong>deep</strong></em></span></p>'
  );
  const range = selectTextNode(container, 'strong', 0, 4);
  const ancestors = getFormattingAncestors(range, container, getNonCopyableSelector());
  document.body.removeChild(container);

  return assert(ancestors.length === 2, `应有 2 个祖先，实际 ${ancestors.length}`)
    && assert(ancestors[0].tagName.toLowerCase() === 'strong', `第1个应为 strong`)
    && assert(ancestors[1].tagName.toLowerCase() === 'em', `第2个应为 em`);
});

/* ==================== 3. wrapWithMissingFormatting 行为 ==================== */

console.log('\n=== 3. wrapWithMissingFormatting 行为 ===');

test('3.1 纯文本 + [strong] 祖先 → 正确包裹', () => {
  const container = createTestContainer('<p><strong>bold</strong></p>');
  const range = selectTextNode(container, 'strong', 0, 4);
  const ancestors = getFormattingAncestors(range, container, getNonCopyableSelector());
  const result = wrapWithMissingFormatting('bold', ancestors);
  document.body.removeChild(container);

  return assert(result === '<strong>bold</strong>', `应为 <strong>bold</strong>，实际: ${result}`);
});

test('3.2 已包含 strong + [strong] 祖先 → 不双重包裹', () => {
  const container = createTestContainer('<p><strong>bold</strong></p>');
  const range = selectElementContent(container, 'strong');
  const ancestors = getFormattingAncestors(range, container, getNonCopyableSelector());
  const result = wrapWithMissingFormatting('<strong>bold</strong>', ancestors);
  document.body.removeChild(container);

  return assert(result === '<strong>bold</strong>', `不应双重包裹，实际: ${result}`);
});

test('3.3 纯文本 + [strong, em] 嵌套祖先 → 正确嵌套包裹', () => {
  const ancestors = [
    document.createElement('strong'),
    document.createElement('em'),
  ];
  const result = wrapWithMissingFormatting('text', ancestors);

  return assert(result === '<em><strong>text</strong></em>',
    `应为 <em><strong>text</strong></em>，实际: ${result}`);
});

test('3.4 已有 strong 外层 + [strong, em] 祖先 → 只补 em', () => {
  const ancestors = [
    document.createElement('strong'),
    document.createElement('em'),
  ];
  const result = wrapWithMissingFormatting('<strong>text</strong>', ancestors);

  return assert(result === '<em><strong>text</strong></em>',
    `应为 <em><strong>text</strong></em>（不双重 strong），实际: ${result}`);
});

test('3.5 空祖先列表 → 不修改 HTML', () => {
  const result = wrapWithMissingFormatting('<strong>text</strong>', []);
  return assert(result === '<strong>text</strong>', `空祖先应不修改，实际: ${result}`);
});

/* ==================== 4. sanitizeHTML 行为 ==================== */

console.log('\n=== 4. sanitizeHTML 行为 ===');

test('4.1 修订 span 包裹加粗 → 移除修订保留加粗', () => {
  const adapter = new DOMRangeAdapter({ container: document.createElement('div') });
  const result = adapter.sanitizeHTML(
    '<span class="revision-insert" data-revision-id="r1"><strong>8F</strong></span>'
  );
  return assert(result === '<strong>8F</strong>', `实际: ${result}`);
});

test('4.2 修订 span 包裹纯文本 → 移除修订保留文本', () => {
  const adapter = new DOMRangeAdapter({ container: document.createElement('div') });
  const result = adapter.sanitizeHTML(
    '<span class="revision-insert" data-revision-id="r1">plain text</span>'
  );
  return assert(result === 'plain text', `实际: ${result}`);
});

test('4.3 书签+加粗嵌套 → 移除书签保留加粗', () => {
  const adapter = new DOMRangeAdapter({ container: document.createElement('div') });
  const result = adapter.sanitizeHTML(
    '<span class="bm" data-bm-id="x"><strong>bold</strong></span>'
  );
  return assert(!result.includes('data-bm-id'), `不应有书签: ${result}`)
    && assert(result.includes('<strong>bold</strong>'), `应有加粗: ${result}`);
});

test('4.4 多种样式嵌套在修订内 → 全部保留', () => {
  const adapter = new DOMRangeAdapter({ container: document.createElement('div') });
  const result = adapter.sanitizeHTML(
    '<span class="revision-insert" data-revision-id="r1"><strong>B</strong><em>I</em><u>U</u></span>'
  );
  return assert(!result.includes('revision-insert'), `不应有修订: ${result}`)
    && assert(result.includes('<strong>B</strong>'), `应有加粗: ${result}`)
    && assert(result.includes('<em>I</em>'), `应有斜体: ${result}`)
    && assert(result.includes('<u>U</u>'), `应有下划线: ${result}`);
});

test('4.5 无不可复制容器 → 原样返回', () => {
  const adapter = new DOMRangeAdapter({ container: document.createElement('div') });
  const html = '<p>hello <strong>world</strong></p>';
  const result = adapter.sanitizeHTML(html);
  return assert(result === html, `应原样返回，实际: ${result}`);
});

/* ==================== 5. 端到端：模拟完整 handleCopyCut ==================== */

console.log('\n=== 5. 端到端：模拟完整 handleCopyCut 流程 ===');

test('5.1 修订内加粗文本，选区在加粗文本内 → 保留加粗、移除修订', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1"><strong>8F</strong></span></p>'
  );
  const range = selectTextNode(container, 'strong', 0, 2);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertNotContains(result, 'revision-insert', 'data-revision-id')
    && assertContainsTagged(result, 'strong', '8F');
});

test('5.2 修订内普通文本+加粗，只选加粗 → 保留加粗、移除修订', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1">7<strong>8F</strong></span></p>'
  );
  const range = selectTextNode(container, 'strong', 0, 2);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertNotContains(result, 'revision-insert')
    && assertContainsTagged(result, 'strong', '8F');
});

test('5.3 修订内普通文本+加粗，全选 → 保留全部内容、移除修订', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1">7<strong>8F</strong></span></p>'
  );
  const range = selectElementContent(container, '.revision-insert');
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertNotContains(result, 'revision-insert')
    && assert(result.includes('7'), `应保留文本 "7": ${result}`)
    && assert(result.includes('<strong>8F</strong>'), `应保留加粗: ${result}`);
});

test('5.4 无修订的加粗文本，选区在加粗内 → 保留加粗', () => {
  const container = createTestContainer('<p>hello<strong>bold</strong>world</p>');
  const range = selectTextNode(container, 'strong', 0, 4);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertContainsTagged(result, 'strong', 'bold');
});

test('5.5 无修订的 em>strong 嵌套，选区在 strong 内 → 保留两层格式', () => {
  const container = createTestContainer('<p><em><strong>BoldItalic</strong></em></p>');
  const range = selectTextNode(container, 'strong', 0, 10);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assert(result.includes('<em><strong>BoldItalic</strong></em>'),
    `应保留 <em><strong>BoldItalic</strong></em>，实际: ${result}`);
});

test('5.6 修订>em>strong 三层嵌套 → 跳过修订，保留 em 和 strong', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1"><em><strong>deep</strong></em></span></p>'
  );
  const range = selectTextNode(container, 'strong', 0, 4);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertNotContains(result, 'revision-insert')
    && assert(result.includes('<em><strong>deep</strong></em>'),
      `应保留 <em><strong>deep</strong></em>，实际: ${result}`);
});

test('5.7 书签内加粗 → 移除书签保留加粗', () => {
  const container = createTestContainer(
    '<p><span class="bm" data-bm-id="b1"><strong>Bookmarked</strong></span></p>'
  );
  const range = selectTextNode(container, 'strong', 0, 10);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertNotContains(result, 'data-bm-id', '.bm')
    && assertContainsTagged(result, 'strong', 'Bookmarked');
});

test('5.8 多种样式在修订内 → 全部保留', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1"><strong>B</strong> and <em>I</em></span></p>'
  );
  /** 选区覆盖整个修订内容 */
  const range = selectElementContent(container, '.revision-insert');
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertNotContains(result, 'revision-insert')
    && assert(result.includes('<strong>B</strong>'), `应保留加粗: ${result}`)
    && assert(result.includes('<em>I</em>'), `应保留斜体: ${result}`);
});

test('5.9 两个修订span之间有加粗文本 → 各自正确处理', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1">inserted</span><strong>bold</strong><span class="revision-delete" data-revision-id="r2">deleted</span></p>'
  );
  const range = selectTextNode(container, 'strong', 0, 4);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertContainsTagged(result, 'strong', 'bold');
});

test('5.10 选区跨越纯文本和加粗（无修订）→ 保留结构', () => {
  const container = createTestContainer('<p>hello <strong>world</strong> end</p>');
  const textNode = container.querySelector('p')!.firstChild!;
  const strongTextNode = container.querySelector('strong')!.firstChild!;
  const range = document.createRange();
  range.setStart(textNode, 3);
  range.setEnd(strongTextNode, 5);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assert(result.includes('lo') && result.includes('<strong>world</strong>'),
    `应保留跨越内容: ${result}`);
});

test('5.11 部分选区（只选加粗文本的一部分）→ 仍保留加粗', () => {
  const container = createTestContainer('<p><strong>BoldText</strong></p>');
  const range = selectTextNode(container, 'strong', 0, 4);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertContainsTagged(result, 'strong', 'Bold');
});

test('5.12 修订内部分选区（只选文本前半部分）→ 移除修订保留文本', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1">partial text</span></p>'
  );
  const range = selectTextNode(container, '.revision-insert', 0, 7);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertNotContains(result, 'revision-insert')
    && assert(result.includes('partial'), `应保留部分文本: ${result}`);
});

/* ==================== 6. 复杂边界场景 ==================== */

console.log('\n=== 6. 复杂边界场景 ===');

test('6.1 修订内只有纯文本（无格式化标签）→ 只有纯文本', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1">just text</span></p>'
  );
  const range = selectTextNode(container, '.revision-insert', 0, 9);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assert(result === 'just text', `应只剩纯文本: '${result}'`);
});

test('6.2 嵌套的不可复制容器（修订嵌套书签）内加粗 → 全部移除，保留加粗', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1"><span class="bm" data-bm-id="x"><strong>Nested</strong></span></span></p>'
  );
  const range = selectTextNode(container, 'strong', 0, 6);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertNotContains(result, 'revision-insert', 'data-bm-id')
    && assertContainsTagged(result, 'strong', 'Nested');
});

test('6.3 多个修订各自包含加粗 → 选区跨多个修订', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1"><strong>A</strong></span> and <span class="revision-insert" data-revision-id="r2"><strong>B</strong></span></p>'
  );
  const p = container.querySelector('p')!;
  const range = document.createRange();
  range.setStart(p, 0);
  range.setEnd(p, p.childNodes.length);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertNotContains(result, 'revision-insert')
    && assert(result.includes('<strong>A</strong>') && result.includes('<strong>B</strong>'),
      `应保留两个加粗: ${result}`);
});

test('6.4 加粗内含斜体，选区在斜体内 → 保留两层', () => {
  const container = createTestContainer('<p><strong>Bold <em>and italic</em></strong></p>');
  const range = selectTextNode(container, 'em', 0, 10);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assert(result.includes('<strong><em>and italic</em></strong>'),
    `应保留 <strong><em>and italic</em></strong>，实际: ${result}`);
});

test('6.5 删除修订内加粗 → 移除修订保留加粗', () => {
  const container = createTestContainer(
    '<p><span class="revision-delete" data-revision-id="r1"><strong>deleted bold</strong></span></p>'
  );
  const range = selectTextNode(container, 'strong', 0, 12);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertNotContains(result, 'revision-delete')
    && assertContainsTagged(result, 'strong', 'deleted bold');
});

test('6.6 段落内文本 + 修订 + 文本 → 选区跨段落结构', () => {
  const container = createTestContainer(
    '<p>Before<span class="revision-insert" data-revision-id="r1">inserted</span>After</p>'
  );
  const p = container.querySelector('p')!;
  const range = document.createRange();
  range.setStart(p, 0);
  range.setEnd(p, p.childNodes.length);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertNotContains(result, 'revision-insert')
    && assert(result.includes('Before') && result.includes('inserted') && result.includes('After'),
      `应保留全部文本: ${result}`);
});

test('6.7 修订内加粗文本，选区在加粗的中间部分 → 仍保留加粗', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1"><strong>BoldText</strong></span></p>'
  );
  const range = selectTextNode(container, 'strong', 2, 6);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertNotContains(result, 'revision-insert')
    && assertContainsTagged(result, 'strong', 'ldTe');
});

test('6.8 空内容选区 → 不应崩溃', () => {
  const container = createTestContainer('<p><strong></strong></p>');
  const strong = container.querySelector('strong')!;
  const range = document.createRange();
  range.setStart(strong, 0);
  range.setEnd(strong, 0);

  /** 空选区在 handleCopyCut 中会被 selection.isCollapsed 过滤，这里只测试函数不崩溃 */
  const fragment = range.cloneContents();
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment);
  document.body.removeChild(container);

  return assert(wrapper.innerHTML === '', `空选区应返回空 HTML: '${wrapper.innerHTML}'`);
});

/* ==================== 7. UEditor Plus 自定义样式支持 ==================== */

console.log('\n=== 7. UEditor Plus 自定义样式（非预定义样式） ===');

test('7.1 span style="color:red" 内文本 → 保留内联 span 样式', () => {
  const container = createTestContainer('<p><span style="color:red">red text</span></p>');
  const range = selectTextNode(container, 'span', 0, 8);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assert(result.includes('style="color:red"') || result.includes('style="color: red"'),
    `应保留内联样式 span: ${result}`);
});

test('7.2 修订内的自定义 span 样式 → 移除修订保留自定义样式', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1"><span style="color:red">colored</span></span></p>'
  );
  const range = selectTextNode(container, 'span[style]', 0, 7);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertNotContains(result, 'revision-insert')
    && assert(result.includes('style="color:red"') || result.includes('style="color: red"'),
      `应保留内联样式: ${result}`);
});

test('7.3 sub 上标 → 保留', () => {
  const container = createTestContainer('<p><sub>H<sub>2</sub></sub>O</p>');
  const range = selectTextNode(container, 'sub sub', 0, 1);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assert(result.includes('<sub>'), `应保留 sub 标签: ${result}`);
});

test('7.4 a 链接内文本 → 保留链接', () => {
  const container = createTestContainer('<p><a href="http://example.com">link</a></p>');
  const range = selectTextNode(container, 'a', 0, 4);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assert(result.includes('href="http://example.com"'),
    `应保留链接: ${result}`);
});

test('7.5 修订内的链接 → 移除修订保留链接', () => {
  const container = createTestContainer(
    '<p><span class="revision-insert" data-revision-id="r1"><a href="http://example.com">link</a></span></p>'
  );
  const range = selectTextNode(container, 'a', 0, 4);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assertNotContains(result, 'revision-insert')
    && assert(result.includes('href="http://example.com"'),
      `应保留链接: ${result}`);
});

test('7.6 多层自定义样式嵌套 → 全部保留', () => {
  const container = createTestContainer(
    '<p><span style="color:red"><strong><em>styled</em></strong></span></p>'
  );
  const range = selectTextNode(container, 'em', 0, 6);
  const result = simulateCopy(container, range);
  document.body.removeChild(container);

  return assert(result.includes('style="color:red"') || result.includes('style="color: red"'),
    `应保留 span style: ${result}`)
    && assert(result.includes('<strong>'), `应保留 strong: ${result}`)
    && assert(result.includes('<em>styled</em>'), `应保留 em: ${result}`);
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

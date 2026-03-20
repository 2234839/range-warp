/**
 * Table 元素处理测试
 *
 * 测试 table 结构在各种容器操作中的正确性：
 * - getText 虚拟 \n 位置计算
 * - 样式容器应用（bold/italic 等跨单元格）
 * - 语义容器应用（bookmark/revision 跨单元格）
 * - removeConfig 跨单元格移除
 * - queryConfigs 查询
 * - getBlockElementsInRange 块级元素收集
 *
 * table 结构层级: table > thead/tbody > tr > td/th
 * 虚拟 \n 规则: 只有叶子块（不含块级子元素的块级元素）才在内容后添加虚拟 \n
 * - table 有块级子元素 thead/tbody → 不添加 \n
 * - thead/tbody 有块级子元素 tr → 不添加 \n
 * - tr 有块级子元素 td/th → 不添加 \n
 * - td/th 没有块级子元素 → 添加 \n（叶子块）
 */
import { JSDOM } from 'jsdom';
import { DOMRangeAdapter, registerContainerConfig } from '../core/adapters/DOMRangeAdapter.js';

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
registerContainerConfig('bookmark', {
  tagName: 'span', attributeSelector: '.bookmark', display: 'inline',
  crossBlock: 'split', idAttribute: 'data-bookmark-id', splitRepair: 'fill-gaps',
});
registerContainerConfig('revision-insert', {
  tagName: 'span', attributeSelector: '.revision-insert', display: 'inline',
  crossBlock: 'split', idAttribute: 'data-revision-id',
});

function assert(condition: boolean, testName: string) {
  if (!condition) throw new Error(`断言失败: ${testName}`);
}

function createEnv(html: string) {
  const container = dom.window.document.createElement('div');
  container.innerHTML = html;
  const adapter = new DOMRangeAdapter({ container });
  return { container, adapter };
}

function normalizeHTML(html: string): string {
  return html.replace(/\s+/g, '').replace(/>\s+</g, '><');
}

let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passCount++;
    console.log(`✅ PASS: ${name}`);
  } catch (error: any) {
    failCount++;
    console.log(`❌ FAIL: ${name}`);
    console.log(`   ${error.message}`);
  }
}

// ==================== 1. getText 文本提取 ====================
test('1.1 单个单元格 getText', () => {
  const { adapter } = createEnv('<table><tbody><tr><td>Hello</td></tr></tbody></table>');
  /** td 是叶子块，Hello(5) + \n(1) = 6 */
  const text = adapter.getText(0, 6);
  assert(text === 'Hello\n', `预期 'Hello\\n', 实际 '${text}'`);
});

test('1.2 两个单元格 getText', () => {
  const { adapter } = createEnv(
    '<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>'
  );
  /** A(1) + \n(1) + B(1) + \n(1) = 4 */
  const text = adapter.getText(0, 4);
  assert(text === 'A\nB\n', `预期 'A\\nB\\n', 实际 '${text}'`);
});

test('1.3 两行两列 getText', () => {
  const { adapter } = createEnv(
    '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>'
  );
  /** A\nB\nC\nD\n = 8 */
  const text = adapter.getText(0, 8);
  assert(text === 'A\nB\nC\nD\n', `预期 'A\\nB\\nC\\nD\\n', 实际 '${text}'`);
});

test('1.4 thead + tbody getText', () => {
  const { adapter } = createEnv(
    '<table><thead><tr><th>H1</th><th>H2</th></tr></thead><tbody><tr><td>D1</td><td>D2</td></tr></tbody></table>'
  );
  /** H1\nH2\nD1\nD2\n = 12 */
  const text = adapter.getText(0, 12);
  assert(text === 'H1\nH2\nD1\nD2\n', `预期 'H1\\nH2\\nD1\\nD2\\n', 实际 '${text}'`);
});

test('1.5 带样式的单元格 getText', () => {
  const { adapter } = createEnv(
    '<table><tbody><tr><td><strong>Bold</strong> text</td></tr></tbody></table>'
  );
  /** Bold text(9) + \n(1) = 10 */
  const text = adapter.getText(0, 10);
  assert(text === 'Bold text\n', `预期 'Bold text\\n', 实际 '${text}'`);
});

test('1.6 table 前后文本 getText', () => {
  const { adapter } = createEnv(
    '<p>Before</p><table><tbody><tr><td>Cell</td></tr></tbody></table><p>After</p>'
  );
  const len = adapter.getDocumentLength();
  const text = adapter.getText(0, len);
  assert(text === 'Before\nCell\nAfter\n', `预期 'Before\\nCell\\nAfter\\n', 实际 '${text}', len=${len}`);
});

// ==================== 2. applyConfig 样式应用 ====================
test('2.1 单元格内应用粗体', () => {
  const { adapter, container } = createEnv(
    '<table><tbody><tr><td>Hello</td></tr></tbody></table>'
  );
  adapter.applyConfig(0, 5, 'bold');
  const html = normalizeHTML(container.innerHTML);
  assert(html.includes('<strong>Hello</strong>'), `粗体未正确应用: ${html}`);
});

test('2.2 跨单元格应用粗体', () => {
  const { adapter, container } = createEnv(
    '<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>'
  );
  /** A=0, \n=1, B=2 → 选中 0-3 跨两个单元格 */
  adapter.applyConfig(0, 3, 'bold');
  const html = normalizeHTML(container.innerHTML);
  assert(html.includes('<strong>A</strong>'), `第一个单元格粗体未应用: ${html}`);
  assert(html.includes('<strong>B</strong>'), `第二个单元格粗体未应用: ${html}`);
});

test('2.3 跨行应用粗体', () => {
  const { adapter, container } = createEnv(
    '<table><tbody><tr><td>A</td></tr><tr><td>B</td></tr></tbody></table>'
  );
  /** A=0, \n=1, B=2 → 选中 0-3 跨两行 */
  adapter.applyConfig(0, 3, 'bold');
  const html = normalizeHTML(container.innerHTML);
  assert(html.includes('<strong>A</strong>'), `第一行粗体未应用: ${html}`);
  assert(html.includes('<strong>B</strong>'), `第二行粗体未应用: ${html}`);
});

test('2.4 单元格部分文本应用斜体', () => {
  const { adapter, container } = createEnv(
    '<table><tbody><tr><td>Hello World</td></tr></tbody></table>'
  );
  adapter.applyConfig(0, 5, 'italic');
  const html = normalizeHTML(container.innerHTML);
  assert(html.includes('<em>Hello</em>'), `部分斜体未正确应用: ${html}`);
});

test('2.5 table 与普通段落混合时跨区域应用粗体', () => {
  const { adapter, container } = createEnv(
    '<p>Before</p><table><tbody><tr><td>Cell</td></tr></tbody></table>'
  );
  /** Before=0-6, \n=6, Cell=7-11 → 选中 0-12 全部 */
  adapter.applyConfig(0, 12, 'bold');
  const html = normalizeHTML(container.innerHTML);
  assert(html.includes('<strong>Before</strong>'), `段落粗体未应用: ${html}`);
  assert(html.includes('<strong>Cell</strong>'), `单元格粗体未应用: ${html}`);
});

// ==================== 3. 语义容器（bookmark/revision）跨单元格 ====================
test('3.1 跨单元格应用 bookmark', () => {
  const { adapter, container } = createEnv(
    '<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>'
  );
  adapter.wrapElement(0, 3, () => {
    const el = dom.window.document.createElement('span');
    el.className = 'bookmark';
    el.setAttribute('data-bookmark-id', 'bm1');
    return el;
  }, { mode: 'wrap' });
  const html = normalizeHTML(container.innerHTML);
  assert(html.includes('data-bookmark-id="bm1"'), `bookmark 未应用: ${html}`);
});

test('3.2 跨单元格应用 revision-insert', () => {
  const { adapter, container } = createEnv(
    '<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>'
  );
  adapter.wrapElement(0, 3, () => {
    const el = dom.window.document.createElement('span');
    el.className = 'revision-insert';
    el.setAttribute('data-revision-id', 'rev1');
    return el;
  }, { mode: 'wrap' });
  const html = normalizeHTML(container.innerHTML);
  assert(html.includes('data-revision-id="rev1"'), `revision 未应用: ${html}`);
});

// ==================== 4. removeConfig 移除容器 ====================
test('4.1 移除单元格内粗体', () => {
  const { adapter, container } = createEnv(
    '<table><tbody><tr><td><strong>Hello</strong></td></tr></tbody></table>'
  );
  adapter.removeConfig(0, 5, 'bold');
  const html = normalizeHTML(container.innerHTML);
  assert(!html.includes('<strong>'), `粗体未移除: ${html}`);
  assert(html.includes('Hello'), `文本丢失: ${html}`);
});

test('4.2 移除跨单元格粗体', () => {
  const { adapter, container } = createEnv(
    '<table><tbody><tr><td><strong>A</strong></td><td><strong>B</strong></td></tr></tbody></table>'
  );
  adapter.removeConfig(0, 3, 'bold');
  const html = normalizeHTML(container.innerHTML);
  assert(!html.includes('<strong>'), `粗体未完全移除: ${html}`);
});

test('4.3 部分移除单元格内粗体', () => {
  const { adapter, container } = createEnv(
    '<table><tbody><tr><td><strong>HelloWorld</strong></td></tr></tbody></table>'
  );
  /** 移除位置 5-6 (即 'W') 的粗体，前段 Hello(0-5) 保留 strong，中段 W(5-6) 去掉 strong，后段 orld(6-10) 保留 strong */
  adapter.removeConfig(5, 6, 'bold');
  const html = normalizeHTML(container.innerHTML);
  assert(html.includes('<strong>Hello</strong>'), `前段粗体应保留: ${html}`);
  assert(html.includes('W'), `中段 W 应保留（无粗体）: ${html}`);
  assert(html.includes('<strong>orld</strong>'), `后段粗体应保留: ${html}`);
});

// ==================== 5. queryConfigs 查询 ====================
test('5.1 查询单元格内样式', () => {
  const { adapter } = createEnv(
    '<table><tbody><tr><td><strong>Hello</strong></td></tr></tbody></table>'
  );
  const configs = adapter.queryConfigs(0, 5);
  assert(configs.has('bold'), `应包含 bold, 实际: ${[...configs]}`);
});

test('5.2 查询跨单元格样式', () => {
  const { adapter } = createEnv(
    '<table><tbody><tr><td><strong>A</strong></td><td><em>B</em></td></tr></tbody></table>'
  );
  const configs = adapter.queryConfigs(0, 3);
  assert(configs.has('bold'), `应包含 bold`);
  assert(configs.has('italic'), `应包含 italic`);
});

// ==================== 6. getBlockElementsInRange ====================
test('6.1 获取 table 内的块级元素', () => {
  const { adapter } = createEnv(
    '<table><tbody><tr><td>Cell</td></tr></tbody></table>'
  );
  const blocks = adapter.getBlockElementsInRange(0, 5);
  const tags = blocks.map(el => el.tagName.toLowerCase());
  assert(tags.includes('td'), `应包含 td, 实际: ${tags}`);
});

test('6.2 table 前后块级元素收集', () => {
  const { adapter } = createEnv(
    '<p>Before</p><table><tbody><tr><td>Cell</td></tr></tbody></table><p>After</p>'
  );
  const len = adapter.getDocumentLength();
  const blocks = adapter.getBlockElementsInRange(0, len);
  const tags = blocks.map(el => el.tagName.toLowerCase());
  assert(tags.includes('p'), `应包含 p, 实际: ${tags}`);
  assert(tags.includes('td'), `应包含 td, 实际: ${tags}`);
});

// ==================== 7. getDocumentLength ====================
test('7.1 单个单元格文档长度', () => {
  const { adapter } = createEnv(
    '<table><tbody><tr><td>Hello</td></tr></tbody></table>'
  );
  const len = adapter.getDocumentLength();
  assert(len === 6, `预期 6 (Hello + \\n), 实际 ${len}`);
});

test('7.2 两行两列文档长度', () => {
  const { adapter } = createEnv(
    '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>'
  );
  const len = adapter.getDocumentLength();
  assert(len === 8, `预期 8 (A\\nB\\nC\\nD\\n), 实际 ${len}`);
});

// ==================== 8. 元素位置计算 ====================
test('8.1 单元格元素位置', () => {
  const { adapter, container } = createEnv(
    '<table><tbody><tr><td>Hello</td></tr></tbody></table>'
  );
  const td = container.querySelector('td')!;
  const pos = adapter.getElementPosition(td);
  assert(pos !== null, '位置不应为 null');
  assert(pos!.start === 0, `起始应为 0, 实际 ${pos!.start}`);
  /** td 的位置基于其内部文本节点，虚拟 \n 不算在 td 内 */
  assert(pos!.end === 5, `结束应为 5, 实际 ${pos!.end}`);
});

test('8.2 table 元素位置', () => {
  const { adapter, container } = createEnv(
    '<table><tbody><tr><td>Hello</td></tr></tbody></table>'
  );
  const table = container.querySelector('table')!;
  const pos = adapter.getElementPosition(table);
  assert(pos !== null, '位置不应为 null');
  assert(pos!.start === 0, `起始应为 0, 实际 ${pos!.start}`);
  assert(pos!.end === 5, `结束应为 5, 实际 ${pos!.end}`);
});

// ==================== 9. 复杂场景 ====================
test('9.1 table 嵌套在 div 中', () => {
  const { adapter, container } = createEnv(
    '<div><table><tbody><tr><td>Cell</td></tr></tbody></table></div>'
  );
  /** div 有块级子元素 table → 不添加 \n; table 内部 td 是叶子块 → 添加 \n */
  const text = adapter.getText(0, 5);
  assert(text === 'Cell\n', `预期 'Cell\\n', 实际 '${text}'`);
});

test('9.2 多个 table', () => {
  const { adapter } = createEnv(
    '<table><tbody><tr><td>A</td></tr></tbody></table><table><tbody><tr><td>B</td></tr></tbody></table>'
  );
  const text = adapter.getText(0, 4);
  assert(text === 'A\nB\n', `预期 'A\\nB\\n', 实际 '${text}'`);
});

test('9.3 空单元格', () => {
  const { adapter } = createEnv(
    '<table><tbody><tr><td></td><td>Data</td></tr></tbody></table>'
  );
  /** 空 td 是叶子块 → 贡献虚拟 \n(1); Data td → Data(4) + \n(1) = 6 */
  const len = adapter.getDocumentLength();
  assert(len === 6, `预期 6, 实际 ${len}`);
  const text = adapter.getText(0, len);
  assert(text === '\nData\n', `预期 '\\nData\\n', 实际 '${text}'`);
});

test('9.4 空单元格 + br', () => {
  const { adapter } = createEnv(
    '<table><tbody><tr><td><br></td><td>Data</td></tr></tbody></table>'
  );
  const len = adapter.getDocumentLength();
  const text = adapter.getText(0, len);
  /** td(br): br 贡献 \n(1); td 不再添加尾部 \n（因为 hasBr && !hasTextContent） */
  assert(text === '\nData\n', `预期 '\\nData\\n', 实际 '${text}'`);
});

test('9.5 跨 table 和普通文本应用粗体', () => {
  const { adapter, container } = createEnv(
    '<p>Text</p><table><tbody><tr><td>Cell</td></tr></tbody></table>'
  );
  /** Text=0-4, \n=4, Cell=5-9 → 选中 0-10 */
  adapter.applyConfig(0, 10, 'bold');
  const html = normalizeHTML(container.innerHTML);
  assert(html.includes('<strong>Text</strong>'), `段落粗体未应用: ${html}`);
  assert(html.includes('<strong>Cell</strong>'), `单元格粗体未应用: ${html}`);
});

// ==================== 10. 边界情况 ====================
test('10.1 单元格内只有 br 的 table', () => {
  const { adapter } = createEnv(
    '<table><tbody><tr><td><br></td></tr></tbody></table>'
  );
  const len = adapter.getDocumentLength();
  assert(len === 1, `预期 1 (只有 br 的 \\n), 实际 ${len}`);
});

test('10.2 table 前后都有文本', () => {
  const { adapter } = createEnv(
    '<p>A</p><table><tbody><tr><td>B</td></tr></tbody></table><p>C</p>'
  );
  const len = adapter.getDocumentLength();
  const text = adapter.getText(0, len);
  assert(text === 'A\nB\nC\n', `预期 'A\\nB\\nC\\n', 实际 '${text}', len=${len}`);
  assert(len === 6, `预期 6, 实际 ${len}`);
});

test('10.3 跨多行多列应用样式', () => {
  const { adapter, container } = createEnv(
    '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>'
  );
  /** 选中全部 0-8 */
  adapter.applyConfig(0, 8, 'bold');
  const html = normalizeHTML(container.innerHTML);
  assert(html.includes('<strong>A</strong>'), `A 粗体未应用: ${html}`);
  assert(html.includes('<strong>B</strong>'), `B 粗体未应用: ${html}`);
  assert(html.includes('<strong>C</strong>'), `C 粗体未应用: ${html}`);
  assert(html.includes('<strong>D</strong>'), `D 粗体未应用: ${html}`);
});

test('10.4 单元格内 bookmark 位置跟踪', () => {
  const { adapter, container } = createEnv(
    '<table><tbody><tr><td><span class="bookmark" data-bookmark-id="bm1">Text</span></td></tr></tbody></table>'
  );
  const bm = container.querySelector('.bookmark')!;
  const pos = adapter.getElementPosition(bm);
  assert(pos !== null, 'bookmark 位置不应为 null');
  assert(pos!.start === 0, `bookmark 起始应为 0, 实际 ${pos!.start}`);
  assert(pos!.end === 4, `bookmark 结束应为 4, 实际 ${pos!.end}`);
});

test('10.5 跨行 bookmark 位置计算', () => {
  const { adapter, container } = createEnv(
    '<table><tbody><tr><td><span class="bookmark" data-bookmark-id="bm1">A</span></td></tr><tr><td><span class="bookmark" data-bookmark-id="bm1">B</span></td></tr></tbody></table>'
  );
  const bookmarks = container.querySelectorAll('.bookmark');
  assert(bookmarks.length === 2, `应有 2 个 bookmark, 实际 ${bookmarks.length}`);

  const pos1 = adapter.getElementPosition(bookmarks[0]);
  assert(pos1 !== null && pos1.start === 0, `第一个 bookmark 位置: ${JSON.stringify(pos1)}`);

  const pos2 = adapter.getElementPosition(bookmarks[1]);
  assert(pos2 !== null && pos2.start === 2, `第二个 bookmark 位置: ${JSON.stringify(pos2)}`);
});

// ==================== 汇总 ====================
console.log('\n' + '='.repeat(60));
console.log('📊 Table 测试结果汇总');
console.log('='.repeat(60));
console.log(`✅ 通过: ${passCount}`);
console.log(`❌ 失败: ${failCount}`);
console.log(`📈 通过率: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

process.exit(failCount > 0 ? 1 : 0);

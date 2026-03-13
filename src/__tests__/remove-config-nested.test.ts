/**
 * removeConfig 嵌套场景测试（底层 adapter 层）
 *
 * 测试路径: tsx src/__tests__/remove-config-nested.test.ts
 *
 * 直接测试 adapter 层的 applyConfig / removeConfig 行为，
 * 验证移除特定配置容器时不会影响其他容器：
 * - 样式容器嵌套（strong > em）
 * - 样式 + 语义容器嵌套（strong > .bookmark）
 * - 样式 + 修订嵌套（em > .revision-insert）
 * - 同标签名不同配置的嵌套（.bookmark > .revision-insert，都是 span）
 * - applyConfig 后 removeConfig 的 toggle 行为
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

/* 注册所有配置 */
registerContainerConfig('bold', { tagName: 'strong', display: 'inline' });
registerContainerConfig('italic', { tagName: 'em', display: 'inline' });
registerContainerConfig('underline', { tagName: 'u', display: 'inline' });
registerContainerConfig('strikethrough', { tagName: 's', display: 'inline' });
registerContainerConfig('highlight', { tagName: 'mark', display: 'inline' });
registerContainerConfig('bookmark', { tagName: 'span', attributeSelector: '.bookmark', display: 'inline', crossBlock: 'split', idAttribute: 'data-bookmark-id', splitRepair: 'fill-gaps', removeEmpty: false });
registerContainerConfig('revision-insert', { tagName: 'span', attributeSelector: '.revision-insert', display: 'inline', crossBlock: 'split', idAttribute: 'data-revision-id' });
registerContainerConfig('revision-delete', { tagName: 'span', attributeSelector: '.revision-delete', display: 'inline', crossBlock: 'split', idAttribute: 'data-revision-id' });

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${testName}`);
    failed++;
  }
}

function logHtml(container: HTMLElement, label: string) {
  console.log(`  [${label}] ${container.innerHTML}`);
}

function createEnv(html: string) {
  const container = dom.window.document.createElement('div');
  container.innerHTML = html;
  const adapter = new DOMRangeAdapter({ container });
  return { container, adapter };
}

/* ==================== 1. 基础样式嵌套移除 ==================== */

{
  const { container, adapter } = createEnv('<strong><em>Hello</em></strong> World');

  /* 1.1 移除外层 strong，内层 em 应保留 */
  adapter.removeConfig(0, 5, 'bold');
  logHtml(container, '1.1');
  assert(container.querySelector('em') !== null, '1.1 移除 strong 后 em 保留');
  assert(container.querySelector('strong') === null, '1.2 移除 strong 后 strong 不存在');
}

{
  const { container, adapter } = createEnv('<strong><em>Hello</em></strong> World');

  /* 1.2 移除内层 em，外层 strong 应保留 */
  adapter.removeConfig(0, 5, 'italic');
  logHtml(container, '1.2');
  assert(container.querySelector('strong') !== null, '1.3 移除 em 后 strong 保留');
  assert(container.querySelector('em') === null, '1.4 移除 em 后 em 不存在');
}

/* ==================== 2. applyConfig 创建的嵌套移除 ==================== */

{
  const { container, adapter } = createEnv('Hello World');

  /* 2.1 先应用 bold 再应用 italic，然后移除 bold */
  adapter.applyConfig(0, 5, 'bold');
  adapter.applyConfig(0, 5, 'italic');
  logHtml(container, '2.1 before remove');
  adapter.removeConfig(0, 5, 'bold');
  logHtml(container, '2.1 after remove');
  assert(container.querySelector('strong') === null, '2.1 移除 bold 后 strong 不存在');
  assert(container.querySelector('em') !== null, '2.2 移除 bold 后 em 保留');
}

{
  const { container, adapter } = createEnv('Hello World');

  /* 2.2 先应用 bold 再应用 italic，然后移除 italic */
  adapter.applyConfig(0, 5, 'bold');
  adapter.applyConfig(0, 5, 'italic');
  logHtml(container, '2.2 before remove');
  adapter.removeConfig(0, 5, 'italic');
  logHtml(container, '2.2 after remove');
  assert(container.querySelector('em') === null, '2.3 移除 italic 后 em 不存在');
  assert(container.querySelector('strong') !== null, '2.4 移除 italic 后 strong 保留');
}

/* ==================== 3. 三层样式嵌套 ==================== */

{
  const { container, adapter } = createEnv('Hello World');

  /* 3.1 应用三层样式，移除中间层 */
  adapter.applyConfig(0, 5, 'bold');
  adapter.applyConfig(0, 5, 'italic');
  adapter.applyConfig(0, 5, 'underline');
  logHtml(container, '3.1 before remove');
  adapter.removeConfig(0, 5, 'italic');
  logHtml(container, '3.1 after remove');
  assert(container.querySelector('strong') !== null, '3.1 移除 italic 后 strong 保留');
  assert(container.querySelector('em') === null, '3.2 移除 italic 后 em 不存在');
  assert(container.querySelector('u') !== null, '3.3 移除 italic 后 u 保留');
}

{
  const { container, adapter } = createEnv('Hello World');

  /* 3.2 应用三层样式，移除最外层 */
  adapter.applyConfig(0, 5, 'bold');
  adapter.applyConfig(0, 5, 'italic');
  adapter.applyConfig(0, 5, 'underline');
  logHtml(container, '3.2 before remove');
  adapter.removeConfig(0, 5, 'bold');
  logHtml(container, '3.2 after remove');
  assert(container.querySelector('strong') === null, '3.4 移除 bold 后 strong 不存在');
  assert(container.querySelector('em') !== null, '3.5 移除 bold 后 em 保留');
  assert(container.querySelector('u') !== null, '3.6 移除 bold 后 u 保留');
}

{
  const { container, adapter } = createEnv('Hello World');

  /* 3.3 应用三层样式，移除最内层 */
  adapter.applyConfig(0, 5, 'bold');
  adapter.applyConfig(0, 5, 'italic');
  adapter.applyConfig(0, 5, 'underline');
  logHtml(container, '3.3 before remove');
  adapter.removeConfig(0, 5, 'underline');
  logHtml(container, '3.3 after remove');
  assert(container.querySelector('strong') !== null, '3.7 移除 underline 后 strong 保留');
  assert(container.querySelector('em') !== null, '3.8 移除 underline 后 em 保留');
  assert(container.querySelector('u') === null, '3.9 移除 underline 后 u 不存在');
}

/* ==================== 4. 样式 + 语义容器嵌套（applyConfig） ==================== */

{
  const { container, adapter } = createEnv('Hello World');

  /* 4.1 先应用 bold 再创建 bookmark，移除 bold 应保留 bookmark */
  adapter.applyConfig(0, 5, 'bold');
  adapter.applyConfig(0, 5, 'bookmark');
  logHtml(container, '4.1 before remove');
  adapter.removeConfig(0, 5, 'bold');
  logHtml(container, '4.1 after remove');
  assert(container.querySelector('strong') === null, '4.1 移除 bold 后 strong 不存在');
  const bm = container.querySelector('.bookmark');
  assert(bm !== null, '4.2 移除 bold 后 bookmark 保留');
}

{
  const { container, adapter } = createEnv('Hello World');

  /* 4.2 先应用 bold 再创建 bookmark，移除 bookmark 应保留 bold */
  adapter.applyConfig(0, 5, 'bold');
  adapter.applyConfig(0, 5, 'bookmark');
  logHtml(container, '4.2 before remove');
  adapter.removeConfig(0, 5, 'bookmark');
  logHtml(container, '4.2 after remove');
  assert(container.querySelector('strong') !== null, '4.3 移除 bookmark 后 strong 保留');
  assert(container.querySelector('.bookmark') === null, '4.4 移除 bookmark 后 bookmark 不存在');
}

/* ==================== 5. 样式 + 修订嵌套（applyConfig） ==================== */

{
  const { container, adapter } = createEnv('Hello World');

  /* 5.1 先应用 italic 再创建修订，移除 italic 应保留修订 */
  adapter.applyConfig(0, 5, 'italic');
  adapter.applyConfig(0, 5, 'revision-insert');
  logHtml(container, '5.1 before remove');
  adapter.removeConfig(0, 5, 'italic');
  logHtml(container, '5.1 after remove');
  assert(container.querySelector('em') === null, '5.1 移除 italic 后 em 不存在');
  assert(container.querySelector('.revision-insert') !== null, '5.2 移除 italic 后 revision 保留');
}

{
  const { container, adapter } = createEnv('Hello World');

  /* 5.2 先应用 italic 再创建修订，移除修订应保留 italic */
  adapter.applyConfig(0, 5, 'italic');
  adapter.applyConfig(0, 5, 'revision-insert');
  logHtml(container, '5.2 before remove');
  adapter.removeConfig(0, 5, 'revision-insert');
  logHtml(container, '5.2 after remove');
  assert(container.querySelector('em') !== null, '5.3 移除 revision 后 em 保留');
  assert(container.querySelector('.revision-insert') === null, '5.4 移除 revision 后 revision 不存在');
}

/* ==================== 6. 手动构造复杂嵌套 HTML（通过 getElementPosition 获取正确位置） ==================== */

{
  const { container, adapter } = createEnv('<p><strong><span class="bookmark" data-bookmark-id="test-id" data-bookmark-name="test" data-bookmark-create-time="1234">Hello</span></strong></p>');

  /* 6.1 移除 strong，bookmark 应保留 */
  const pos = adapter.getElementPosition(container.querySelector('strong')!)!;
  adapter.removeConfig(pos.start, pos.end, 'bold');
  logHtml(container, '6.1');
  assert(container.querySelector('strong') === null, '6.1 移除 bold 后 strong 不存在');
  const bm = container.querySelector('.bookmark');
  assert(bm !== null, '6.2 移除 bold 后 bookmark 保留');
  assert(bm!.textContent === 'Hello', '6.3 bookmark 文本正确');
}

{
  const { container, adapter } = createEnv('<p><span class="revision-insert" data-revision-id="rev-1" data-revision-type="insert" data-revision-author="a" data-revision-time="1234"><strong><em>Hello</em></strong></span></p>');

  /* 6.2 移除 strong，em 和 revision 应保留 */
  const pos = adapter.getElementPosition(container.querySelector('strong')!)!;
  adapter.removeConfig(pos.start, pos.end, 'bold');
  logHtml(container, '6.2');
  assert(container.querySelector('strong') === null, '6.4 移除 bold 后 strong 不存在');
  assert(container.querySelector('em') !== null, '6.5 移除 bold 后 em 保留');
  assert(container.querySelector('.revision-insert') !== null, '6.6 移除 bold 后 revision 保留');
}

{
  const { container, adapter } = createEnv('<p><span class="revision-insert" data-revision-id="rev-1" data-revision-type="insert" data-revision-author="a" data-revision-time="1234"><strong><em>Hello</em></strong></span></p>');

  /* 6.3 移除 revision，strong 和 em 应保留 */
  const pos = adapter.getElementPosition(container.querySelector('.revision-insert')!)!;
  adapter.removeConfig(pos.start, pos.end, 'revision-insert');
  logHtml(container, '6.3');
  assert(container.querySelector('.revision-insert') === null, '6.7 移除 revision 后 revision 不存在');
  assert(container.querySelector('strong') !== null, '6.8 移除 revision 后 strong 保留');
  assert(container.querySelector('em') !== null, '6.9 移除 revision 后 em 保留');
}

/* ==================== 7. 同标签名不同配置（span.bookmark > span.revision-insert） ==================== */

{
  const { container, adapter } = createEnv('<p><span class="bookmark" data-bookmark-id="bm-1" data-bookmark-name="test" data-bookmark-create-time="1234"><span class="revision-insert" data-revision-id="rev-1" data-revision-type="insert" data-revision-author="a" data-revision-time="1234">Hello</span></span></p>');

  /* 7.1 移除 bookmark，revision 应保留 */
  const pos = adapter.getElementPosition(container.querySelector('.bookmark')!)!;
  adapter.removeConfig(pos.start, pos.end, 'bookmark');
  logHtml(container, '7.1');
  assert(container.querySelector('.bookmark') === null, '7.1 移除 bookmark 后 bookmark 不存在');
  assert(container.querySelector('.revision-insert') !== null, '7.2 移除 bookmark 后 revision 保留');
}

{
  const { container, adapter } = createEnv('<p><span class="bookmark" data-bookmark-id="bm-1" data-bookmark-name="test" data-bookmark-create-time="1234"><span class="revision-insert" data-revision-id="rev-1" data-revision-type="insert" data-revision-author="a" data-revision-time="1234">Hello</span></span></p>');

  /* 7.2 移除 revision，bookmark 应保留 */
  const pos = adapter.getElementPosition(container.querySelector('.revision-insert')!)!;
  adapter.removeConfig(pos.start, pos.end, 'revision-insert');
  logHtml(container, '7.2');
  assert(container.querySelector('.revision-insert') === null, '7.3 移除 revision 后 revision 不存在');
  assert(container.querySelector('.bookmark') !== null, '7.4 移除 revision 后 bookmark 保留');
}

/* ==================== 8. 部分范围移除 ==================== */

{
  const { container, adapter } = createEnv('<strong><em>Hello World</em></strong>');

  /* 8.1 只移除前半部分的 bold */
  adapter.removeConfig(0, 5, 'bold');
  logHtml(container, '8.1');
  assert(container.querySelector('em') !== null, '8.1 部分移除 bold 后 em 保留');
  assert(container.textContent?.includes('Hello'), '8.2 文本 Hello 保留');
  assert(container.textContent?.includes('World'), '8.3 文本 World 保留');
}

{
  const { container, adapter } = createEnv('<strong><span class="bookmark" data-bookmark-id="bm-1" data-bookmark-name="test" data-bookmark-create-time="1234">Hello World</span></strong>');

  /* 8.2 部分移除嵌套的 bold */
  adapter.removeConfig(0, 5, 'bold');
  logHtml(container, '8.2');
  assert(container.querySelector('.bookmark') !== null, '8.4 部分移除 bold 后 bookmark 保留');
  assert(container.textContent?.includes('Hello'), '8.5 文本 Hello 保留');
  assert(container.textContent?.includes('World'), '8.6 文本 World 保留');
}

/* ==================== 9. 连续相同样式容器内的嵌套移除 ==================== */

{
  const { container, adapter } = createEnv('<strong>a<strong>b</strong>c</strong>');

  /* 9.1 移除内部 strong（位置 1-2），外部 strong 应保留 */
  /* normalize 后内部 strong 应该被合并进外部 */
  logHtml(container, '9.1 before');
  adapter.removeConfig(1, 2, 'bold');
  logHtml(container, '9.1 after');
  assert(container.textContent === 'abc', '9.1 文本完整');
}

/* ==================== 10. removeConfig 后 queryConfigs 验证 ==================== */

{
  const { adapter } = createEnv('Hello World');

  /* 10.1 应用三样式后移除一个，queryConfigs 应只返回剩余两个 */
  adapter.applyConfig(0, 5, 'bold');
  adapter.applyConfig(0, 5, 'italic');
  adapter.applyConfig(0, 5, 'underline');

  adapter.removeConfig(0, 5, 'bold');

  const configs = adapter.queryConfigs(0, 5);
  assert(!configs.has('bold'), '10.1 queryConfigs 不包含 bold');
  assert(configs.has('italic'), '10.2 queryConfigs 包含 italic');
  assert(configs.has('underline'), '10.3 queryConfigs 包含 underline');
}

/* ==================== 结果 ==================== */

console.log('\n' + '='.repeat(60));
console.log('📊 removeConfig 嵌套场景测试结果');
console.log('='.repeat(60));
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`📈 通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);

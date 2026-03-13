/**
 * removeConfig 嵌套场景测试 v2（使用正确位置）
 *
 * 测试路径: tsx src/__tests__/remove-config-debug.test.ts
 *
 * 先调试位置系统，再用正确位置写测试
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
registerContainerConfig('bookmark', { tagName: 'span', attributeSelector: '.bookmark', display: 'inline', crossBlock: 'split', idAttribute: 'data-bookmark-id', splitRepair: 'fill-gaps', removeEmpty: false });
registerContainerConfig('revision-insert', { tagName: 'span', attributeSelector: '.revision-insert', display: 'inline', crossBlock: 'split', idAttribute: 'data-revision-id' });

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

function createEnv(html: string) {
  const container = dom.window.document.createElement('div');
  container.innerHTML = html;
  const adapter = new DOMRangeAdapter({ container });
  return { container, adapter };
}

/* ==================== 0. 调试位置系统 ==================== */

{
  const { adapter } = createEnv('<p>Hello</p>');
  console.log(`  [0.1] docLen=${adapter.getDocumentLength()}, text="${adapter.getText(0, adapter.getDocumentLength())}"`);
}

{
  const { adapter } = createEnv('<p><strong>Hello</strong></p>');
  const pos = adapter.getElementPosition(adapter.querySelectorAll('strong')[0]);
  console.log(`  [0.2] strong pos=${JSON.stringify(pos)}, docLen=${adapter.getDocumentLength()}, text="${adapter.getText(0, adapter.getDocumentLength())}"`);
}

{
  const { adapter } = createEnv('<p><strong><em>Hello</em></strong></p>');
  const strongPos = adapter.getElementPosition(adapter.querySelectorAll('strong')[0]);
  const emPos = adapter.getElementPosition(adapter.querySelectorAll('em')[0]);
  console.log(`  [0.3] strong pos=${JSON.stringify(strongPos)}, em pos=${JSON.stringify(emPos)}, text="${adapter.getText(0, adapter.getDocumentLength())}"`);
}

{
  const { container, adapter } = createEnv('<p><strong><span class="bookmark" data-bookmark-id="bm-1" data-bookmark-name="test" data-bookmark-create-time="1234">Hello</span></strong></p>');
  const strongPos = adapter.getElementPosition(adapter.querySelectorAll('strong')[0]);
  const bmPos = adapter.getElementPosition(adapter.querySelectorAll('.bookmark')[0]);
  console.log(`  [0.4] strong pos=${JSON.stringify(strongPos)}, bm pos=${JSON.stringify(bmPos)}, text="${adapter.getText(0, adapter.getDocumentLength())}"`);
}

/* ==================== 1. 手动 HTML 嵌套：完全移除 bold（使用正确位置） ==================== */

{
  const { container, adapter } = createEnv('<p><strong><em>Hello</em></strong></p>');
  const strongPos = adapter.getElementPosition(adapter.querySelectorAll('strong')[0])!;

  /* 完全移除 strong */
  adapter.removeConfig(strongPos.start, strongPos.end, 'bold');
  console.log(`  [1.1] result=${container.innerHTML}`);
  assert(container.querySelector('strong') === null, '1.1 strong 完全移除');
  assert(container.querySelector('em') !== null, '1.2 em 保留');
}

{
  const { container, adapter } = createEnv('<p><strong><span class="bookmark" data-bookmark-id="bm-1" data-bookmark-name="test" data-bookmark-create-time="1234">Hello</span></strong></p>');
  const strongPos = adapter.getElementPosition(adapter.querySelectorAll('strong')[0])!;

  /* 完全移除 strong */
  adapter.removeConfig(strongPos.start, strongPos.end, 'bold');
  console.log(`  [1.2] result=${container.innerHTML}`);
  assert(container.querySelector('strong') === null, '1.3 strong 完全移除');
  assert(container.querySelector('.bookmark') !== null, '1.4 bookmark 保留');
  assert(container.querySelector('.bookmark')!.textContent === 'Hello', '1.5 bookmark 文本正确');
}

/* ==================== 2. 手动 HTML 嵌套：完全移除 bookmark（使用正确位置） ==================== */

{
  const { container, adapter } = createEnv('<p><strong><span class="bookmark" data-bookmark-id="bm-1" data-bookmark-name="test" data-bookmark-create-time="1234">Hello</span></strong></p>');
  const bmPos = adapter.getElementPosition(adapter.querySelectorAll('.bookmark')[0])!;

  /* 完全移除 bookmark */
  adapter.removeConfig(bmPos.start, bmPos.end, 'bookmark');
  console.log(`  [2.1] result=${container.innerHTML}`);
  assert(container.querySelector('.bookmark') === null, '2.1 bookmark 完全移除');
  assert(container.querySelector('strong') !== null, '2.2 strong 保留');
  assert(container.querySelector('strong')!.textContent === 'Hello', '2.3 strong 文本正确');
}

/* ==================== 3. 手动 HTML 嵌套：strong + revision + bold/italic ==================== */

{
  const { container, adapter } = createEnv('<p><span class="revision-insert" data-revision-id="rev-1" data-revision-type="insert" data-revision-author="a" data-revision-time="1234"><strong><em>Hello</em></strong></span></p>');
  const strongPos = adapter.getElementPosition(adapter.querySelectorAll('strong')[0])!;

  /* 完全移除 strong */
  adapter.removeConfig(strongPos.start, strongPos.end, 'bold');
  console.log(`  [3.1] result=${container.innerHTML}`);
  assert(container.querySelector('strong') === null, '3.1 strong 完全移除');
  assert(container.querySelector('em') !== null, '3.2 em 保留');
  assert(container.querySelector('.revision-insert') !== null, '3.3 revision 保留');
}

{
  const { container, adapter } = createEnv('<p><span class="revision-insert" data-revision-id="rev-1" data-revision-type="insert" data-revision-author="a" data-revision-time="1234"><strong><em>Hello</em></strong></span></p>');
  const revPos = adapter.getElementPosition(adapter.querySelectorAll('.revision-insert')[0])!;

  /* 完全移除 revision */
  adapter.removeConfig(revPos.start, revPos.end, 'revision-insert');
  console.log(`  [3.2] result=${container.innerHTML}`);
  assert(container.querySelector('.revision-insert') === null, '3.4 revision 完全移除');
  assert(container.querySelector('strong') !== null, '3.5 strong 保留');
  assert(container.querySelector('em') !== null, '3.6 em 保留');
}

/* ==================== 4. 同标签 span: bookmark > revision ==================== */

{
  const { container, adapter } = createEnv('<p><span class="bookmark" data-bookmark-id="bm-1" data-bookmark-name="test" data-bookmark-create-time="1234"><span class="revision-insert" data-revision-id="rev-1" data-revision-type="insert" data-revision-author="a" data-revision-time="1234">Hello</span></span></p>');
  const bmPos = adapter.getElementPosition(adapter.querySelectorAll('.bookmark')[0])!;

  /* 完全移除 bookmark */
  adapter.removeConfig(bmPos.start, bmPos.end, 'bookmark');
  console.log(`  [4.1] result=${container.innerHTML}`);
  assert(container.querySelector('.bookmark') === null, '4.1 bookmark 完全移除');
  assert(container.querySelector('.revision-insert') !== null, '4.2 revision 保留');
}

{
  const { container, adapter } = createEnv('<p><span class="bookmark" data-bookmark-id="bm-1" data-bookmark-name="test" data-bookmark-create-time="1234"><span class="revision-insert" data-revision-id="rev-1" data-revision-type="insert" data-revision-author="a" data-revision-time="1234">Hello</span></span></p>');
  const revPos = adapter.getElementPosition(adapter.querySelectorAll('.revision-insert')[0])!;

  /* 完全移除 revision */
  adapter.removeConfig(revPos.start, revPos.end, 'revision-insert');
  console.log(`  [4.2] result=${container.innerHTML}`);
  assert(container.querySelector('.revision-insert') === null, '4.3 revision 完全移除');
  assert(container.querySelector('.bookmark') !== null, '4.4 bookmark 保留');
}

/* ==================== 5. applyConfig 创建的嵌套，完全移除 ==================== */

{
  const { container, adapter } = createEnv('Hello World');

  /* 先 bold，再 bookmark（applyConfig 模式），再移除 bold */
  adapter.applyConfig(0, 5, 'bold');
  adapter.applyConfig(0, 5, 'bookmark');
  console.log(`  [5.1 before] ${container.innerHTML}`);

  const strongPos = adapter.getElementPosition(adapter.querySelectorAll('strong')[0])!;
  adapter.removeConfig(strongPos.start, strongPos.end, 'bold');
  console.log(`  [5.1 after] ${container.innerHTML}`);
  assert(container.querySelector('strong') === null, '5.1 移除 bold 后 strong 不存在');
  assert(container.querySelector('.bookmark') !== null, '5.2 移除 bold 后 bookmark 保留');
}

{
  const { container, adapter } = createEnv('Hello World');

  /* 先 bold，再 bookmark（applyConfig 模式），再移除 bookmark */
  adapter.applyConfig(0, 5, 'bold');
  adapter.applyConfig(0, 5, 'bookmark');
  console.log(`  [5.2 before] ${container.innerHTML}`);

  const bmPos = adapter.getElementPosition(adapter.querySelectorAll('.bookmark')[0])!;
  adapter.removeConfig(bmPos.start, bmPos.end, 'bookmark');
  console.log(`  [5.2 after] ${container.innerHTML}`);
  assert(container.querySelector('.bookmark') === null, '5.3 移除 bookmark 后 bookmark 不存在');
  assert(container.querySelector('strong') !== null, '5.4 移除 bookmark 后 strong 保留');
}

/* ==================== 6. 部分范围移除（使用正确位置） ==================== */

{
  const { container, adapter } = createEnv('<p><strong><em>Hello World</em></strong></p>');
  const strongPos = adapter.getElementPosition(adapter.querySelectorAll('strong')[0])!;

  /* 部分移除 strong：只移除前半 */
  const partialEnd = strongPos.start + Math.floor((strongPos.end - strongPos.start) / 2);
  adapter.removeConfig(strongPos.start, partialEnd, 'bold');
  console.log(`  [6.1] result=${container.innerHTML}`);
  assert(container.querySelector('em') !== null, '6.1 部分移除 bold 后 em 保留');
  assert(container.textContent?.includes('Hello'), '6.2 文本 Hello 保留');
  assert(container.textContent?.includes('World'), '6.3 文本 World 保留');
}

{
  const { container, adapter } = createEnv('<p><strong><span class="bookmark" data-bookmark-id="bm-1" data-bookmark-name="test" data-bookmark-create-time="1234">Hello World</span></strong></p>');
  const strongPos = adapter.getElementPosition(adapter.querySelectorAll('strong')[0])!;

  /* 部分移除 strong */
  const partialEnd = strongPos.start + Math.floor((strongPos.end - strongPos.start) / 2);
  adapter.removeConfig(strongPos.start, partialEnd, 'bold');
  console.log(`  [6.2] result=${container.innerHTML}`);
  assert(container.querySelector('.bookmark') !== null, '6.4 部分移除 bold 后 bookmark 保留');
  assert(container.textContent?.includes('Hello'), '6.5 文本 Hello 保留');
  assert(container.textContent?.includes('World'), '6.6 文本 World 保留');
}

/* ==================== 7. 跨段落嵌套移除 ==================== */

{
  const { container, adapter } = createEnv('<p><strong><em>Hello</em></strong></p><p><strong><em>World</em></strong></p>');
  const allStrong = adapter.querySelectorAll('strong');
  console.log(`  [7.0] strong count=${allStrong.length}`);

  /* 用第一个 strong 的开始到最后一个 strong 的结束 */
  const firstPos = adapter.getElementPosition(allStrong[0])!;
  const lastPos = adapter.getElementPosition(allStrong[allStrong.length - 1])!;
  console.log(`  [7.0] first=${JSON.stringify(firstPos)}, last=${JSON.stringify(lastPos)}`);

  adapter.removeConfig(firstPos.start, lastPos.end, 'bold');
  console.log(`  [7.1] result=${container.innerHTML}`);
  assert(container.querySelectorAll('strong').length === 0, '7.1 所有 strong 被移除');
  assert(container.querySelectorAll('em').length === 2, '7.2 两个 em 保留');
}

/* ==================== 结果 ==================== */

console.log('\n' + '='.repeat(60));
console.log('📊 removeConfig 嵌套场景测试 v2 结果');
console.log('='.repeat(60));
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log(`📈 通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);

/**
 * removeStyle 嵌套 bug 复现测试
 *
 * 测试路径: tsx src/__tests__/remove-style-bug.test.ts
 *
 * Bug：多层嵌套（em > s > strong > u）中移除某一层样式时，
 * 内部其他层也被错误解包或拆分
 */
import { JSDOM } from 'jsdom';
import { DOMRangeAdapter, registerContainerConfig } from '../core/adapters/DOMRangeAdapter.js';
import { StyleService } from '../core/services/StyleService.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });

global.window = dom.window as any;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.Text = dom.window.Text;
global.Range = dom.window.Range;
global.NodeFilter = dom.window.NodeFilter;

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) { console.log(`✅ PASS: ${name}`); passed++; }
  else { console.log(`❌ FAIL: ${name}`); failed++; }
}

function createEnv(html: string) {
  const container = dom.window.document.createElement('div');
  container.innerHTML = html;
  const adapter = new DOMRangeAdapter({ container });
  const styleService = new StyleService(adapter);
  return { container, adapter, styleService };
}

/** 获取目标元素位置并完全移除 */
function removeStyleFull(adapter: DOMRangeAdapter, styleService: StyleService, selector: string, style: string) {
  const el = adapter.getContainer().querySelector(selector);
  if (!el) return;
  const pos = adapter.getElementPosition(el)!;
  styleService.removeStyle(pos.start, pos.end, style);
}

/* 场景 1: em > s > strong > u 移除 em，内层应全部保留 */
{
  const { container, adapter, styleService } = createEnv('<p><em><s><strong><u>AB</u></strong></s></em></p>');
  console.log(`  before: ${container.innerHTML}`);
  removeStyleFull(adapter, styleService, 'em', 'italic');
  console.log(`  after:  ${container.innerHTML}`);
  assert(container.querySelector('em') === null, '1. em 被移除');
  assert(container.querySelector('s') !== null, '2. s 保留');
  assert(container.querySelector('strong') !== null, '3. strong 保留');
  assert(container.querySelector('u') !== null, '4. u 保留');
}

/* 场景 2: em > s > strong > u 移除 s，上下层应全部保留 */
{
  const { container, adapter, styleService } = createEnv('<p><em><s><strong><u>AB</u></strong></s></em></p>');
  console.log(`  before: ${container.innerHTML}`);
  removeStyleFull(adapter, styleService, 's', 'strikethrough');
  console.log(`  after:  ${container.innerHTML}`);
  assert(container.querySelector('s') === null, '1. s 被移除');
  assert(container.querySelector('em') !== null, '2. em 保留');
  assert(container.querySelector('strong') !== null, '3. strong 保留');
  assert(container.querySelector('u') !== null, '4. u 保留');
}

/* 场景 3: em > s > strong > u 移除 strong，上下层应全部保留 */
{
  const { container, adapter, styleService } = createEnv('<p><em><s><strong><u>AB</u></strong></s></em></p>');
  console.log(`  before: ${container.innerHTML}`);
  removeStyleFull(adapter, styleService, 'strong', 'bold');
  console.log(`  after:  ${container.innerHTML}`);
  assert(container.querySelector('strong') === null, '1. strong 被移除');
  assert(container.querySelector('em') !== null, '2. em 保留');
  assert(container.querySelector('s') !== null, '3. s 保留');
  assert(container.querySelector('u') !== null, '4. u 保留');
}

/* 场景 4: em > s > strong > u 移除 u，上下层应全部保留 */
{
  const { container, adapter, styleService } = createEnv('<p><em><s><strong><u>AB</u></strong></s></em></p>');
  console.log(`  before: ${container.innerHTML}`);
  removeStyleFull(adapter, styleService, 'u', 'underline');
  console.log(`  after:  ${container.innerHTML}`);
  assert(container.querySelector('u') === null, '1. u 被移除');
  assert(container.querySelector('em') !== null, '2. em 保留');
  assert(container.querySelector('s') !== null, '3. s 保留');
  assert(container.querySelector('strong') !== null, '4. strong 保留');
}

/* 场景 5: em > strong + u（无 s），移除 em */
{
  const { container, adapter, styleService } = createEnv('<p><em><strong>A</strong><u>B</u></em></p>');
  console.log(`  before: ${container.innerHTML}`);
  removeStyleFull(adapter, styleService, 'em', 'italic');
  console.log(`  after:  ${container.innerHTML}`);
  assert(container.querySelector('em') === null, '1. em 被移除');
  assert(container.querySelector('strong') !== null, '2. strong 保留');
  assert(container.querySelector('u') !== null, '3. u 保留');
}

/* 场景 6: 部分范围移除 em — 只移除 "A" 而不覆盖 "B" */
{
  const { container, styleService } = createEnv('<p><em><s><strong><u>AB</u></strong></s></em></p>');
  /* 文本 "AB" 在段落中位置 1-3（跳过开头虚拟 \n），只移除前半部分 */
  styleService.removeStyle(1, 2, 'italic');
  console.log(`  before: <p><em><s><strong><u>AB</u></strong></s></em></p>`);
  console.log(`  after:  ${container.innerHTML}`);
  assert(container.querySelector('u') !== null, '1. u 保留');
  assert(container.querySelector('strong') !== null, '2. strong 保留');
  assert(container.querySelector('s') !== null, '3. s 保留');
}

/* 场景 7: 逐层完全移除 */
{
  const { container, adapter, styleService } = createEnv('<p><em><s><strong><u>AB</u></strong></s></em></p>');
  console.log(`  before: ${container.innerHTML}`);
  removeStyleFull(adapter, styleService, 's', 'strikethrough');
  console.log(`  after remove s: ${container.innerHTML}`);
  assert(container.querySelector('s') === null, '1. s 被移除');
  assert(container.querySelector('strong') !== null, '2. strong 保留');
  assert(container.querySelector('u') !== null, '3. u 保留');
  removeStyleFull(adapter, styleService, 'em', 'italic');
  console.log(`  after remove em: ${container.innerHTML}`);
  assert(container.querySelector('em') === null, '4. em 被移除');
  assert(container.querySelector('strong') !== null, '5. strong 保留');
  assert(container.querySelector('u') !== null, '6. u 保留');
}

/* ==================== 结果 ==================== */

console.log('\n' + '='.repeat(60));
console.log(`✅ 通过: ${passed}  ❌ 失败: ${failed}  通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);

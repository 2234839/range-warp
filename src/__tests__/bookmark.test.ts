/**
 * Bookmark 测试
 *
 * 测试路径: tsx src/__tests__/bookmark.test.ts
 *
 * 测试覆盖:
 * 1. 书签创建 - DOM 结构、metadata、自定义数据
 * 2. 书签查询 - query、getById、findByName、findAll
 * 3. 书签删除 - delete、deleteById、deleteAll
 * 4. 书签位置 - getRange、getText
 * 5. 跨块书签 - 跨段落创建和查询
 * 6. 边界情况 - 空范围、删除后查询、重复 ID
 */

import { JSDOM } from 'jsdom';
import { DOMRangeAdapter } from '../core/adapters/DOMRangeAdapter.js';
import { BookmarkService } from '../core/services/BookmarkService.js';
import { Range } from '../core/models/Range.js';
import { Bookmark } from '../core/models/Bookmark.js';

/** JSDOM 环境初始化 */
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
});
global.window = dom.window as any;
global.document = dom.window.document;
global.Node = dom.window.Node;
global.Text = dom.window.Text;
global.Element = dom.window.Element;
global.NodeFilter = dom.window.NodeFilter;

/* ==================== 测试基础设施 ==================== */

let totalPassed = 0;
let totalFailed = 0;
const allFailures: string[] = [];

/** 运行单个测试 */
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
  }
}

/** 断言并输出失败原因 */
function assert(condition: boolean, message: string): boolean {
  if (!condition) {
    console.log(`     → ${message}`);
  }
  return condition;
}

/** HTML 规范化（去空格方便比较） */
function normalizeHTML(html: string): string {
  return html.replace(/\s+/g, '').replace(/>\s+</g, '><');
}

/**
 * 创建测试环境
 * @param html 初始 HTML 内容
 */
function createEnv(html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  const adapter = new DOMRangeAdapter({ container });
  const service = new BookmarkService(adapter);
  const createRange = (start: number, end: number) =>
    new Range({ start, end, adapter });
  return { container, adapter, service, createRange };
}

/* ==================== 1. 书签创建 ==================== */

console.log('\n=== 1. 书签创建 ===');

test('1.1 创建书签 - DOM 结构正确', () => {
  const { container, service, createRange } = createEnv('你好世界');
  service.create({
    name: '测试书签',
    range: createRange(1, 3),
  });

  const html = container.innerHTML;
  return assert(
    normalizeHTML(html).includes('class="bookmark"'),
    `期望包含 class="bookmark"，实际: ${html}`
  )
    && assert(
      html.includes('data-bookmark-id'),
      `期望包含 data-bookmark-id，实际: ${html}`
    )
    && assert(
      html.includes('data-bookmark-name="测试书签"'),
      `期望包含 data-bookmark-name="测试书签"，实际: ${html}`
    );
});

test('1.2 创建书签 - metadata 正确', () => {
  const { service, createRange } = createEnv('你好世界');
  const bookmark = service.create({
    name: '我的书签',
    range: createRange(0, 2),
    author: '测试作者',
  });

  return assert(
    bookmark.metadata.name === '我的书签',
    `期望 name="我的书签"，实际: ${bookmark.metadata.name}`
  )
    && assert(
      bookmark.metadata.author === '测试作者',
      `期望 author="测试作者"，实际: ${bookmark.metadata.author}`
    )
    && assert(
      bookmark.metadata.id.startsWith('bm-'),
      `期望 id 以 "bm-" 开头，实际: ${bookmark.metadata.id}`
    )
    && assert(
      typeof bookmark.metadata.createTime === 'number',
      `期望 createTime 为数字`
    );
});

test('1.3 创建书签 - 自定义数据存储到 DOM 属性', () => {
  const { container, service, createRange } = createEnv('你好世界');
  service.create({
    name: '带数据书签',
    range: createRange(1, 3),
    customData: { color: 'red', priority: 'high' },
  });

  const html = container.innerHTML;
  return assert(
    html.includes('data-bookmark-color="red"'),
    `期望包含 data-bookmark-color="red"`
  )
    && assert(
    html.includes('data-bookmark-priority="high"'),
    `期望包含 data-bookmark-priority="high"`
  );
});

test('1.4 创建多个书签 - 独立存在', () => {
  const { container, service, createRange } = createEnv('你好世界测试');
  service.create({ name: '书签1', range: createRange(0, 2) });
  service.create({ name: '书签2', range: createRange(2, 4) });

  const html = container.innerHTML;
  return assert(
    html.includes('书签1'),
    `期望包含 "书签1"`
  )
    && assert(
      html.includes('书签2'),
      `期望包含 "书签2"`
  );
});

/* ==================== 2. 书签查询 ==================== */

console.log('\n=== 2. 书签查询 ===');

test('2.1 query - 获取所有书签', () => {
  const { service, createRange } = createEnv('你好世界测试');
  service.create({ name: '书签A', range: createRange(0, 2) });
  service.create({ name: '书签B', range: createRange(2, 4) });

  const all = service.query();
  return assert(
    all.length === 2,
    `期望 2 个书签，实际: ${all.length}`
  );
});

test('2.2 query - 按名称过滤', () => {
  const { service, createRange } = createEnv('你好世界测试');
  service.create({ name: '重要', range: createRange(0, 2) });
  service.create({ name: '普通', range: createRange(2, 4) });
  service.create({ name: '重要', range: createRange(4, 6) });

  const results = service.query({ name: '重要' });
  return assert(
    results.length === 2,
    `期望 2 个书签，实际: ${results.length}`
  );
});

test('2.3 query - 按作者过滤', () => {
  const { service, createRange } = createEnv('你好世界测试');
  service.create({ name: 'A', range: createRange(0, 2), author: '张三' });
  service.create({ name: 'B', range: createRange(2, 4), author: '李四' });
  service.create({ name: 'C', range: createRange(4, 6), author: '张三' });

  const results = service.query({ author: '张三' });
  return assert(
    results.length === 2,
    `期望 2 个书签，实际: ${results.length}`
  );
});

test('2.4 query - 按时间范围过滤', () => {
  const { service, createRange } = createEnv('你好世界测试');
  service.create({ name: '旧', range: createRange(0, 2) });
  const now = Date.now();
  service.create({ name: '新', range: createRange(2, 4) });

  /** bm1 刚创建完，createTime 在 Date.now() 附近，查询过去 5 秒 */
  const results = service.query({ timeRange: { start: now - 5000, end: now + 5000 } });
  return assert(
    results.length === 2,
    `期望 2 个书签（均在时间范围内），实际: ${results.length}`
  );
});

test('2.5 query - 空容器返回空', () => {
  const { service } = createEnv('你好世界');
  const results = service.query();
  return assert(
    results.length === 0,
    `期望 0 个书签，实际: ${results.length}`
  );
});

test('2.6 getById - 正确查找', () => {
  const { service, createRange } = createEnv('你好世界测试');
  const bm = service.create({ name: '目标', range: createRange(1, 3) });
  const found = service.getById(bm.metadata.id);

  return assert(
    found !== null,
    `期望找到书签`
  )
    && assert(
      found!.metadata.name === '目标',
      `期望 name="目标"，实际: ${found!.metadata.name}`
    );
});

test('2.7 getById - 不存在的 ID', () => {
  const { service } = createEnv('你好世界测试');
  const found = service.getById('not-exist');
  return assert(
    found === null,
    `期望 null，实际: ${found}`
  );
});

/* ==================== 3. Bookmark 静态方法 ==================== */

console.log('\n=== 3. Bookmark 静态方法 ===');

test('3.1 findAll - 找到所有书签', () => {
  const { adapter, service, createRange } = createEnv('你好世界测试');
  service.create({ name: 'A', range: createRange(0, 2) });
  service.create({ name: 'B', range: createRange(3, 5) });

  const bookmarks = Bookmark.findAll(adapter);
  return assert(
    bookmarks.length === 2,
    `期望 2 个书签，实际: ${bookmarks.length}`
  );
});

test('3.2 findById - 静态方法查找', () => {
  const { adapter, service, createRange } = createEnv('你好世界测试');
  const bm = service.create({ name: 'X', range: createRange(1, 3) });

  const found = Bookmark.findById(bm.metadata.id, adapter);
  return assert(
    found !== null && found.metadata.name === 'X',
    `期望找到书签 X`
  );
});

test('3.3 findByName - 按名称查找', () => {
  const { adapter, service, createRange } = createEnv('你好世界测试');
  service.create({ name: '相同', range: createRange(0, 2) });
  service.create({ name: '不同', range: createRange(2, 4) });
  service.create({ name: '相同', range: createRange(4, 6) });

  const results = Bookmark.findByName('相同', adapter);
  return assert(
    results.length === 2,
    `期望 2 个书签，实际: ${results.length}`
  );
});

test('3.4 fromElement - 从 DOM 元素创建', () => {
  const { container, adapter, service, createRange } = createEnv('你好世界测试');
  service.create({ name: '元素测试', range: createRange(1, 3), author: '作者A' });

  const el = container.querySelector('.bookmark');
  if (!el) return assert(false, '找不到 .bookmark 元素');

  const bm = Bookmark.fromElement(el, adapter);
  return assert(
    bm !== null,
    `期望创建 Bookmark`
  )
    && assert(
      bm!.metadata.name === '元素测试',
      `期望 name="元素测试"，实际: ${bm!.metadata.name}`
    )
    && assert(
      bm!.metadata.author === '作者A',
      `期望 author="作者A"`
    );
});

/* ==================== 4. 书签位置和文本 ==================== */

console.log('\n=== 4. 书签位置和文本 ===');

test('4.1 getRange - 范围正确', () => {
  const { service, createRange } = createEnv('你好世界测试');
  const bookmark = service.create({ name: '位置', range: createRange(2, 4) });
  const range = bookmark.getRange();

  return assert(
    range !== null,
    `期望 range 不为 null`
  )
    && assert(
      range!.start === 2,
      `期望 start=2，实际: ${range!.start}`
    )
    && assert(
      range!.end === 4,
      `期望 end=4，实际: ${range!.end}`
    );
});

test('4.2 getText - 文本内容正确', () => {
  const { service, createRange } = createEnv('你好世界测试');
  const bookmark = service.create({ name: '文本', range: createRange(1, 4) });
  return assert(
    bookmark.getText() === '好世界',
    `期望 "好世界"，实际: "${bookmark.getText()}"`
  );
});

test('4.3 getText - 空范围返回空字符串', () => {
  const { service, createRange } = createEnv('你好');
  const bookmark = service.create({ name: '空', range: createRange(0, 0) });
  return assert(
    bookmark.getText() === '',
    `期望空字符串，实际: "${bookmark.getText()}"`
  );
});

test('4.4 getRange - 编辑后位置变化', () => {
  const { adapter, service, createRange } = createEnv('你好世界');
  const bookmark = service.create({ name: '跟随', range: createRange(1, 3) });

  /** 在开头插入 "你好" → 原位置 1,3 变为 3,5 */
  adapter.insertText(0, '你好');
  service.refresh();

  const range = bookmark.getRange();
  return assert(
    range !== null,
    `期望 range 不为 null`
  )
    && assert(
      range!.start === 3,
      `期望 start=3（前插2字符），实际: ${range!.start}`
    )
    && assert(
      range!.end === 5,
      `期望 end=5，实际: ${range!.end}`
    );
});

/* ==================== 5. 书签删除 ==================== */

console.log('\n=== 5. 书签删除 ===');

test('5.1 delete - 删除书签保留文本', () => {
  const { container, service, createRange } = createEnv('你好世界测试');
  const bookmark = service.create({ name: '待删', range: createRange(2, 4) });
  service.delete(bookmark);

  const html = normalizeHTML(container.innerHTML);
  return assert(
    !html.includes('bookmark'),
    `期望不含 bookmark 标记，实际: ${html}`
  )
    && assert(
      container.textContent === '你好世界测试',
      `期望文本不变，实际: "${container.textContent}"`
    );
});

test('5.2 deleteById - 按 ID 删除', () => {
  const { container, service, createRange } = createEnv('你好世界测试');
  const bm = service.create({ name: 'ID删除', range: createRange(0, 2) });
  service.deleteById(bm.metadata.id);

  return assert(
    service.getAll().length === 0,
    `期望 0 个书签，实际: ${service.getAll().length}`
  )
    && assert(
      !normalizeHTML(container.innerHTML).includes('bookmark'),
      `期望不含 bookmark 标记`
    );
});

test('5.3 deleteById - 不存在的 ID 不报错', () => {
  const { service } = createEnv('你好世界测试');
  /** 不应抛出异常 */
  service.deleteById('non-existent');
  return true;
});

test('5.4 deleteAll - 删除所有书签', () => {
  const { container, service, createRange } = createEnv('你好世界测试');
  service.create({ name: 'A', range: createRange(0, 2) });
  service.create({ name: 'B', range: createRange(2, 4) });
  service.create({ name: 'C', range: createRange(4, 6) });
  service.deleteAll();

  return assert(
    service.getAll().length === 0,
    `期望 0 个书签，实际: ${service.getAll().length}`
  )
    && assert(
      !normalizeHTML(container.innerHTML).includes('bookmark'),
      `期望不含 bookmark 标记`
    )
    && assert(
      container.textContent === '你好世界测试',
      `期望文本不变，实际: "${container.textContent}"`
    );
});

test('5.5 remove - Bookmark 实例方法删除', () => {
  const { container, service, createRange } = createEnv('你好世界测试');
  const bm = service.create({ name: '实例删', range: createRange(1, 3) });
  bm.remove();
  service.refresh();

  return assert(
    service.getAll().length === 0,
    `期望 0 个书签，实际: ${service.getAll().length}`
  )
    && assert(
      container.textContent === '你好世界测试',
      `期望文本不变，实际: "${container.textContent}"`
    );
});

test('5.6 删除后重新创建书签 - 正常工作', () => {
  const { service, createRange } = createEnv('你好世界测试');
  const bm1 = service.create({ name: '第一轮', range: createRange(0, 2) });
  service.delete(bm1);
  service.create({ name: '第二轮', range: createRange(2, 4) });

  return assert(
    service.getAll().length === 1,
    `期望 1 个书签，实际: ${service.getAll().length}`
  )
    && assert(
      service.getAll()[0].metadata.name === '第二轮',
    `期望 name="第二轮"`
  );
});

/* ==================== 6. 跨块书签 ==================== */

console.log('\n=== 6. 跨块书签 ===');

test('6.1 跨段落创建书签 - 正确拆分', () => {
  const { container, service, createRange } = createEnv('<p>第一段</p><p>第二段</p>');
  service.create({ name: '跨块', range: createRange(2, 6) });

  /** 应生成两个带相同 data-bookmark-id 的 span */
  const elements = container.querySelectorAll('[data-bookmark-id]');
  const ids = Array.from(elements).map(el => el.getAttribute('data-bookmark-id'));

  return assert(
    elements.length === 2,
    `期望 2 个书签元素，实际: ${elements.length}`
  )
    && assert(
      ids[0] === ids[1],
      `期望两个元素 ID 相同`
  );
});

test('6.2 跨块书签 - getText 合并内容', () => {
  const { service, createRange } = createEnv('<p>第一段</p><p>第二段</p>');
  const bookmark = service.create({ name: '跨块', range: createRange(2, 6) });
  return assert(
    bookmark.getText() === '段第二段',
    `期望 "段第二段"，实际: "${bookmark.getText()}"`
  );
});

test('6.3 跨块书签 - getRange 合并范围', () => {
  const { service, createRange } = createEnv('<p>第一段</p><p>第二段</p>');
  const bookmark = service.create({ name: '跨块', range: createRange(2, 6) });
  const range = bookmark.getRange();

  return assert(
    range !== null,
    `期望 range 不为 null`
  )
    && assert(
      range!.start === 2,
      `期望 start=2，实际: ${range!.start}`
    )
    && assert(
      range!.end === 6,
      `期望 end=6，实际: ${range!.end}`
    );
});

test('6.4 跨块书签删除 - 全部移除', () => {
  const { container, service, createRange } = createEnv('<p>第一段</p><p>第二段</p>');
  const bookmark = service.create({ name: '跨块删', range: createRange(2, 6) });
  service.delete(bookmark);

  const elements = container.querySelectorAll('[data-bookmark-id]');
  return assert(
    elements.length === 0,
    `期望 0 个书签元素，实际: ${elements.length}`
  );
});

/* ==================== 7. 边界情况 ==================== */

console.log('\n=== 7. 边界情况 ===');

test('7.1 refresh - 从已有 DOM 恢复书签', () => {
  const container = document.createElement('div');
  container.innerHTML = '<span class="bookmark" data-bookmark-id="bm-1" data-bookmark-name="已有" data-bookmark-create-time="1000">文本</span>';
  const adapter = new DOMRangeAdapter({ container });
  const service = new BookmarkService(adapter);

  return assert(
    service.getAll().length === 1,
    `期望从 DOM 恢复 1 个书签，实际: ${service.getAll().length}`
  )
    && assert(
      service.getAll()[0].metadata.name === '已有',
      `期望 name="已有"`
    );
});

test('7.2 重复调用 refresh - 结果一致', () => {
  const { service, createRange } = createEnv('你好世界测试');
  service.create({ name: '稳定性', range: createRange(1, 3) });
  service.refresh();
  const first = service.getAll().length;
  service.refresh();
  const second = service.getAll().length;

  return assert(
    first === second && first === 1,
    `期望两次 refresh 结果一致: ${first} === ${second}`
  );
});

test('7.3 带样式的书签 - 样式保留在书签内', () => {
  const { container, service, createRange } = createEnv('<strong>你好</strong>世界');
  service.create({ name: '样式', range: createRange(1, 3) });

  const html = container.innerHTML;
  return assert(
    html.includes('strong'),
    `期望 strong 标签保留，实际: ${html}`
  )
    && assert(
      html.includes('bookmark'),
    `期望 bookmark 标记存在`
  );
});

test('7.4 getAll - 返回副本不影响内部状态', () => {
  const { service, createRange } = createEnv('你好世界测试');
  service.create({ name: '隔离', range: createRange(0, 2) });
  const list1 = service.getAll();
  const list2 = service.getAll();

  return assert(
    list1 !== list2,
    `期望返回不同的数组引用`
  );
});

/* ==================== 汇总 ==================== */

console.log('\n==================================================');
console.log(`总计: ${totalPassed + totalFailed} 个测试`);
console.log(`通过: ${totalPassed} ✅  失败: ${totalFailed} ❌`);
if (allFailures.length > 0) {
  console.log('\n失败的测试:');
  for (const name of allFailures) {
    console.log(`  - ${name}`);
  }
}
console.log('==================================================');

process.exit(totalFailed > 0 ? 1 : 0);

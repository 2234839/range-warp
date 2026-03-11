# Range-Warp 架构重构文档

## 📋 概述

Range-Warp 是一个基于 DOM Range API 的富文本编辑器框架，采用**依赖倒置原则**和**适配器模式**设计，实现了编辑器无关的书签和修订功能。

## 🎯 设计目标

1. **编辑器无关**: 核心逻辑不依赖任何特定的富文本编辑器
2. **基于标准**: 使用原生 DOM Range API，提供准确的文本位置计算
3. **可扩展性**: 分层架构，易于扩展新功能
4. **可测试性**: 核心逻辑可独立测试

## 🏗️ 架构设计

### 四层架构模型

```
┌─────────────────────────────────────────────────────────┐
│  应用层 (Application Layer)                              │
│                                                         │
│  Editor: 提供业务级功能                                  │
│  - 智能文本替换（自动创建修订）                           │
│  - 批量修订操作                                          │
│  - 书签和修订的统一管理                                  │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ 调用
┌─────────────────────────────────────────────────────────┐
│  服务层 (Service Layer)                                  │
│                                                         │
│  BookmarkService: 书签管理服务                           │
│  RevisionService: 修订管理服务                           │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ 调用
┌─────────────────────────────────────────────────────────┐
│  模型层 (Model Layer)                                    │
│                                                         │
│  Range: 文本选区抽象                                     │
│  Bookmark: 书签数据模型                                  │
│  Revision: 修订数据模型                                  │
└─────────────────────────────────────────────────────────┘
                          ▲
                          │ 调用
┌─────────────────────────────────────────────────────────┐
│  适配器层 (Adapter Layer)                                │
│                                                         │
│  IRangeAdapter: 统一接口定义                             │
│  DOMRangeAdapter: 基于 DOM Range API 的实现              │
└─────────────────────────────────────────────────────────┘
```

### 核心设计模式

#### 1. 依赖倒置原则 (DIP)

高层模块（Editor、BookmarkService）依赖抽象接口（IRangeAdapter），而非具体实现。

**好处**：
- ✅ 切换适配器不需要修改上层代码
- ✅ 可以同时支持多种编辑器
- ✅ 便于单元测试

#### 2. 适配器模式 (Adapter Pattern)

将不同编辑器的差异性 API 转换为统一接口。

当前实现：
- **DOMRangeAdapter**: 基于原生 DOM Range API，适用于所有 contenteditable 的编辑器

未来可扩展：
- **QuillAdapter**: 适配 Quill 编辑器
- **ProseMirrorAdapter**: 适配 ProseMirror 编辑器

#### 3. DOM 元素包裹原理

书签和修订直接包裹在 DOM 元素中：

```html
<!-- 书签 -->
<span class="bookmark" data-bookmark-id="bm-001" data-bookmark-name="重要段落">
  这里是被书签标记的文本
</span>

<!-- 插入修订 -->
<span class="revision-insert" data-revision-id="rev-001" data-revision-author="张三">
  这是新插入的文本
</span>

<!-- 删除修订 -->
<span class="revision-delete" data-revision-id="rev-002" data-revision-author="李四">
  <del>这是被删除的文本</del>
</span>
```

**优势**：
- ✅ 自动跟随用户编辑
- ✅ 直接序列化为 HTML
- ✅ 天然支持嵌套
- ✅ 通过 CSS 控制样式

## 📦 核心模块说明

### 1. 适配器层

#### IRangeAdapter 接口

定义了统一的文本操作接口：

```typescript
interface IRangeAdapter {
  getText(start: number, end: number): string;
  insertText(position: number, text: string): void;
  delete(start: number, end: number): void;
  replaceText(start: number, end: number, text: string): void;
  setStyle(start: number, end: number, style: string): void;
  removeStyle(start: number, end: number, style: string): void;
  wrapElement(start: number, end: number, elementCreator: () => Element): void;
  unwrapElement(start: number, end: number, tagName: string): void;
  select(start: number, end: number): void;
  getDocumentLength(): number;
  findText(searchText: string): Array<{ start: number; end: number }>;
  hasStyle(start: number, end: number, tagName: string): boolean;
  getContainer(): HTMLElement;
}
```

#### DOMRangeAdapter 实现

基于原生 DOM Range API 的实现，特点：
- 支持 Unicode 字符下标计算
- 提供准确的跨元素文本位置定位
- 无需依赖任何第三方库

### 2. 模型层

#### Range 类

文本选区的抽象表示：

```typescript
const range = editor.createRange(0, 10);
range.getText();      // 获取选区文本
range.setStyle('bold');  // 应用样式
range.delete();        // 删除选区内容
```

#### Bookmark 类

书签数据模型：

```typescript
// 创建书签
const bookmark = editor.createBookmark({
  name: '重要段落',
  start: 0,
  end: 100,
  author: '张三'
});

// 跳转到书签
bookmark.goto();

// 删除书签
bookmark.remove();
```

#### Revision 类

修订数据模型：

```typescript
// 创建插入修订
const insertRevision = editor.revisions.createInsert({
  range: editor.createRange(0, 10),
  author: '张三',
  comment: '补充说明'
});

// 创建删除修订
const deleteRevision = editor.revisions.createDelete({
  range: editor.createRange(10, 20),
  author: '李四'
});

// 接受修订
revision.accept();

// 拒绝修订
revision.reject();
```

### 3. 服务层

#### BookmarkService

提供书签的完整生命周期管理：

```typescript
// 查询书签
const bookmarks = editor.bookmarks.query({
  name: '重要段落',
  author: '张三'
});

// 删除书签
editor.bookmarks.deleteById('bm-001');

// 跳转到书签
editor.bookmarks.goto('bm-001');
```

#### RevisionService

提供修订的批量操作：

```typescript
// 批量接受指定范围内的修订
const count = editor.revisions.acceptInRange(0, 100);

// 批量接受所有修订
editor.revisions.acceptAll();

// 查询修订
const revisions = editor.revisions.query({
  type: RevisionType.INSERT,
  author: '张三'
});
```

### 4. 应用层

#### Editor 类

最上层的能力封装：

```typescript
const adapter = new DOMRangeAdapter({
  container: document.getElementById('editor')
});

const editor = new Editor({
  adapter,
  currentUser: '张三'
});

// 智能文本替换（自动创建修订）
editor.setText('旧文本', '新文本', {
  asRevision: true,
  revisionAuthor: '张三',
  revisionComment: '优化表达'
});

// 应用样式
editor.applyStyle(0, 10, 'bold');

// 获取所有书签
const bookmarks = editor.getAllBookmarks();

// 批量接受修订
editor.acceptRevisionsInRange(0, 100);
```

## 🎨 样式系统

核心样式定义在 `src/core/styles.css`：

```css
/* 书签样式 */
.bookmark {
  background-color: #fef3c7;
  border-bottom: 2px solid #f59e0b;
}

/* 插入修订 */
.revision-insert {
  background-color: #dcfce7;
  border-bottom: 2px solid #22c55e;
}

/* 删除修订 */
.revision-delete {
  background-color: #fee2e2;
  text-decoration: line-through;
}
```

## 🔧 使用示例

### 基础使用

```vue
<script setup>
import { ref, onMounted } from 'vue';
import { Editor, DOMRangeAdapter } from '@/core';

const editorContainer = ref(null);
let editor = null;

onMounted(() => {
  const adapter = new DOMRangeAdapter({
    container: editorContainer.value
  });

  editor = new Editor({
    adapter,
    currentUser: '张三'
  });
});

function createBookmark() {
  editor.createBookmark({
    name: '我的书签',
    start: 0,
    end: 10
  });
}
</script>

<template>
  <div ref="editorContainer" contenteditable="true"></div>
  <button @click="createBookmark">创建书签</button>
</template>
```

### 高级功能

```typescript
// 智能替换，自动创建修订
editor.setText('错误', '正确', {
  asRevision: true,
  revisionAuthor: '张三',
  revisionComment: '修正错别字'
});

// 批量操作
const count = editor.acceptRevisionsInRange(0, 100);

// 查询和导航
const bookmarks = editor.bookmarks.query({ author: '张三' });
bookmarks[0]?.goto();
```

## 📁 目录结构

```
src/
├── core/                    # 核心模块
│   ├── adapters/           # 适配器层
│   │   ├── IRangeAdapter.ts
│   │   └── DOMRangeAdapter.ts
│   ├── models/             # 模型层
│   │   ├── Range.ts
│   │   ├── Bookmark.ts
│   │   └── Revision.ts
│   ├── services/           # 服务层
│   │   ├── BookmarkService.ts
│   │   └── RevisionService.ts
│   ├── Editor.ts           # 应用层
│   ├── index.ts            # 模块导出
│   └── styles.css          # 核心样式
├── components/             # Vue 组件
│   └── EditorCore.vue
├── App.vue                 # 主应用
└── main.ts                # 入口文件
```

## 🚀 未来计划

### Phase 1: 完善基础功能 ✅
- [x] 实现 DOM Range 适配器
- [x] 实现书签系统
- [x] 实现修订系统
- [x] 实现 Editor 业务逻辑

### Phase 2: 增强功能
- [ ] 实现部分接受/拒绝修订
- [ ] 实现核稿系统集成
- [ ] 实现 AI 润色功能

### Phase 3: 扩展适配器
- [ ] 实现 QuillAdapter
- [ ] 实现 ProseMirrorAdapter
- [ ] 实现 TinyMCEAdapter

### Phase 4: 性能优化
- [ ] 实现下标计算缓存
- [ ] 实现虚拟滚动
- [ ] 使用 Web Worker 优化计算

## 📚 参考资料

- [DOM Range 规范](https://dom.spec.whatwg.org/#ranges)
- [ContentEditable 规范](https://w3c.github.io/editing/)
- [Peritext - 标记与文本分离的 CRDT 算法](https://www.inkandswitch.com/peritext/)
- [ProseMirror 文档](https://prosemirror.net/)

## 📄 许可证

MIT License

---

**架构版本**: v1.0.0
**最后更新**: 2026-03-11
**维护者**: Range-Warp 团队

# Range-Warp 架构文档

## 概述

Range-Warp 是一个基于 DOM Range API 的富文本编辑器框架，采用**适配器模式**和**依赖倒置原则**设计，实现了编辑器无关的书签和修订功能。

核心设计理念：**模型层和服务层完全不知道编辑器的存在，一切操作通过 `IRangeAdapter` 接口完成。**

## 五层架构

```
┌─────────────────────────────────────────────────────────────┐
│  集成层 (Integration Layer)                                  │
│                                                             │
│  useNativeEditor   useUEditorPlus   (可扩展更多 composable)  │
│  - 容器发现        - 脚本加载                                 │
│  - 生命周期管理    - 异步初始化                               │
│  - 事件绑定        - iframe 适配                               │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ 创建 IRangeAdapter 实例
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  应用层 (Application Layer)                                  │
│                                                             │
│  Editor: 统一的业务级 API                                    │
│  - 样式操作、书签、修订、文本替换等                           │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  服务层 (Service Layer)                                      │
│                                                             │
│  BookmarkService: 书签管理（CRUD + 跳转）                    │
│  RevisionService: 修订管理（创建/接受/拒绝/部分解决）        │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  模型层 (Model Layer)                                        │
│                                                             │
│  Range: 文本选区抽象                                         │
│  Bookmark: 书签数据模型                                      │
│  Revision: 修订数据模型                                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  适配器层 (Adapter Layer)                                    │
│                                                             │
│  IRangeAdapter: 统一接口定义（30+ 方法）                     │
│  DOMRangeAdapter: 基于 DOM Range API 的实现                  │
│  ContainerTagConfig: 容器标签配置系统                         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  DOM (浏览器原生)                                            │
│                                                             │
│  contenteditable div / iframe body                           │
└─────────────────────────────────────────────────────────────┘
```

## 跨编辑器集成

### 核心原理

`DOMRangeAdapter` 只需要两个输入：

```typescript
const adapter = new DOMRangeAdapter({
  container: HTMLElement,    // 编辑器的可编辑区域
  ownerWindow?: Window,      // iframe 场景传入 iframe.contentWindow
});
```

只要能拿到这两个信息，所有功能（样式、书签、修订、选区）立即可用。

### 已验证的编辑器

| 编辑器 | 容器获取方式 | 特殊处理 |
|--------|-------------|---------|
| 原生 contenteditable | 直接使用 div 本身 | 无 |
| UEditor Plus | `ue.body`（iframe 的 body） | iframe 脚本加载、样式注入 |

### 集成新编辑器只需一个 composable

以 UEditor Plus 为例，`useUEditorPlus.ts` 封装了：
- 容器发现（如何拿到可编辑区域的 HTMLElement）
- 生命周期（异步脚本加载、`ready()` 回调、销毁）
- 内容同步（`getContent()` / `setContent()`）
- 事件绑定（`contentchange`、`focus`、`selectionchange`）

composable 返回统一接口：

```typescript
{
  editor,           // Ref<Editor | null>
  selectionContext,  // Ref<{ ownerWindow: Window, container: HTMLElement | null }>
  init(content?),   // 初始化
  destroy(),        // 销毁
  getHTML(),        // 获取内容
  setHTML(html),    // 设置内容
}
```

`EditorCore.vue` 通过此接口同时驱动原生模式和 UEditor Plus 模式，模式切换时 `:key` 重建组件。

## 容器配置系统

### 设计原理

书签、修订、高亮等语义标记统一通过**容器配置系统**管理，而非直接创建 DOM 元素：

```typescript
// 1. 注册容器配置（告诉适配器这类元素长什么样）
adapter.registerContainerConfig('bookmark', {
  tagName: 'span',
  attributeSelector: '.bookmark',
  display: 'inline',
  crossBlock: 'split',        // 跨块级元素时拆分
  idAttribute: 'data-bookmark-id',
  splitRepair: 'fill-gaps',   // 编辑导致间隙时自动修复
  copyable: false,             // 复制时不保留标签
});

// 2. 通过配置创建元素（适配器保证在正确的 document 中创建）
adapter.createConfigElement('bookmark', {
  'data-bookmark-id': 'bm-001',
  'data-bookmark-name': '重要段落',
});
```

### 已注册的容器配置

| 配置名 | 标签 | 选择器 | 用途 |
|--------|------|--------|------|
| `bold` | strong | - | 加粗样式 |
| `italic` | em | - | 斜体样式 |
| `underline` | u | - | 下划线样式 |
| `strikethrough` | s | - | 删除线样式 |
| `highlight` | mark | - | 高亮样式 |
| `bookmark` | span | .bookmark | 书签标记 |
| `revision-insert` | span | .revision-insert | 插入修订 |
| `revision-delete` | span | .revision-delete | 删除修订 |

### 配置系统的设计参考

参考 ProseMirror 的 MarkSpec 设计：
- 配置只描述容器是什么（tagName、attributeSelector）
- 包裹行为由调用方的 `WrapOptions`（nest/wrap）决定
- `mergeAdjacent` 控制同类容器是否自动合并

## 跨 iframe 兼容

当编辑器在 iframe 中运行时（如 UEditor Plus），需要处理以下问题：

| 问题 | 解决方案 |
|------|---------|
| `document.createElement` 创建错误 document 的元素 | 所有 DOM 操作使用 `ownerDocument` |
| `window.getSelection()` 返回主窗口选区 | 使用 `ownerWindow.getSelection()` |
| 主文档 CSS 不穿透 iframe | 构造函数自动注入语义元素 CSS |
| `instanceof Text/Element` 对 iframe 节点返回 false | 使用 `node.nodeType` 数值比较 |
| `document.createRange()` 创建错误 Range | 使用 `ownerDocument.createRange()` |

`DOMRangeAdapter` 构造函数自动检测 iframe 场景并注入样式：

```typescript
constructor({ container, ownerWindow }) {
  this._ownerWindow = ownerWindow ?? window;
  this._doc = this._ownerWindow.document;

  // iframe 场景下注入样式
  if (this._doc !== document) {
    const style = this._doc.createElement('style');
    style.textContent = INJECTABLE_STYLES;
    this._doc.head.appendChild(style);
  }
}
```

## DOM 元素包裹原理

书签和修订以 DOM 元素包裹文本，自动跟随用户编辑：

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
  这是待删除的文本
</span>
```

优势：
- 自动跟随用户编辑（文本位置随编辑自动变化）
- 直接序列化为 HTML（无需额外的数据存储）
- 天然支持嵌套（如 `<strong>` 内的修订）
- 通过 CSS 控制样式

## 目录结构

```
src/
├── core/                        # 核心模块（编辑器无关）
│   ├── adapters/
│   │   ├── IRangeAdapter.ts    # 适配器接口定义（30+ 方法）
│   │   └── DOMRangeAdapter.ts  # DOM Range API 实现
│   ├── models/
│   │   ├── Range.ts            # 文本选区抽象
│   │   ├── Bookmark.ts         # 书签数据模型
│   │   └── Revision.ts         # 修订数据模型
│   ├── services/
│   │   ├── BookmarkService.ts  # 书签管理服务
│   │   └── RevisionService.ts  # 修订管理服务
│   ├── Editor.ts               # 统一业务 API
│   ├── utils.ts                # 工具函数
│   ├── styles.css              # 主文档语义元素样式
│   └── index.ts                # 模块导出
├── components/                  # Vue 组件层
│   ├── EditorCore.vue          # 编辑器核心组件（模式无关的 UI）
│   ├── DomTreePanel.vue        # DOM 树可视化面板
│   ├── editor-utils.ts         # 组件共享工具
│   ├── useNativeEditor.ts      # 原生编辑器 composable
│   ├── useUEditorPlus.ts       # UEditor Plus composable
│   └── ...
└── App.vue                     # 主应用
```

## 扩展新编辑器

集成一个新的 contenteditable 编辑器只需：

1. 创建 `useXxxEditor.ts` composable，返回标准接口
2. 在 `EditorCore.vue` 中注册新的模式选项

composable 内部只需封装编辑器特有的逻辑，核心功能（样式、书签、修订）通过 `DOMRangeAdapter` 直接获得。

对于非 DOM Range API 的编辑器（如 ProseMirror），需要实现 `IRangeAdapter` 接口的完全替代方案，但模型层和服务层无需任何修改。

## 测试

```bash
# 运行适配器测试（64 个测试用例）
pnpm tsx src/__tests__/adapter.test.ts

# 运行修订测试（62 个测试用例）
pnpm tsx src/__tests__/revision.test.ts

# 类型检查
pnpm tsc --noEmit
```

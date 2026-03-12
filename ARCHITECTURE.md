# Range-Warp 架构文档

## 概述

Range-Warp 是一个基于 DOM Range API 的富文本编辑器框架，采用**适配器模式**和**依赖倒置原则**设计，实现了编辑器无关的书签和修订功能。

核心设计理念：**模型层和服务层完全不知道编辑器的存在，一切操作通过 `IRangeAdapter` 接口完成。**

## 五层架构

```
┌─────────────────────────────────────────────────────────────────┐
│  组件层 (Component Layer)                                        │
│                                                                 │
│  EditorCore.vue — 双模式编辑器（原生 / UEditor Plus）           │
│  RangeWrap.vue  — 简易独立编辑器                                 │
│  DomTreePanel.vue — DOM 树可视化面板                             │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ 通过 composable 驱动
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  集成层 (Integration Layer)                                     │
│                                                                 │
│  useNativeEditor   useUEditorPlus   (可扩展更多 composable)      │
│  - 容器发现        - 脚本加载                                  │
│  - 生命周期管理    - 异步初始化                                  │
│  - 事件绑定        - iframe 适配                                │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ 创建 IRangeAdapter 实例
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  应用层 (Application Layer)                                     │
│                                                                 │
│  Editor: 统一的业务级 API                                        │
│  - 样式操作、书签、修订、文本替换、剪贴板清洗、格式状态查询       │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  服务层 (Service Layer)                                         │
│                                                                 │
│  BookmarkService: 书签管理（CRUD + 跳转）                       │
│  RevisionService: 修订管理（创建/接受/拒绝/部分解决/冲突处理）   │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  模型层 (Model Layer)                                           │
│                                                                 │
│  Range: 文本选区抽象                                             │
│  Bookmark: 书签数据模型（DOM 持久化、跨块拆分、动态位置计算）    │
│  Revision: 修订数据模型（插入/删除语义、接受/拒绝业务规则）       │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  适配器层 (Adapter Layer)                                       │
│                                                                 │
│  IRangeAdapter: 统一接口定义（23 个方法）                        │
│  DOMRangeAdapter: 基于 DOM Range API 的实现                     │
│  ContainerTagConfig: 容器标签配置系统                            │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  DOM (浏览器原生)                                               │
│                                                                 │
│  contenteditable div / iframe body                              │
└─────────────────────────────────────────────────────────────────┘
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
| UEditor Plus | `ue.body`（iframe 的 body） | iframe 脚本加载、样式注入、domUtils 修补 |

### EditorComposable 统一接口

所有编辑器 composable 返回统一的 `EditorComposable` 接口：

```typescript
interface EditorComposable {
  /** 编辑器实例（shallowRef 避免深层响应式解包类实例） */
  editor: ShallowRef<Editor | null>;
  /** 选区上下文（window + container） */
  selectionContext: Ref<{ ownerWindow: Window; container: HTMLElement | null }>;
  /** 是否正在加载（原生模式始终为 false） */
  loading: Ref<boolean>;
  /** 是否就绪（原生模式始终为 true） */
  ready: Ref<boolean>;
  /** 是否加载出错（原生模式始终为 false） */
  error: Ref<boolean>;
  /** 初始化编辑器 */
  init(initialContent?: string): void;
  /** 销毁编辑器 */
  destroy(): void;
  /** 获取 HTML 内容 */
  getHTML(): string;
  /** 设置 HTML 内容 */
  setHTML(html: string): void;
}
```

### 双组件策略

| 组件 | 定位 | 编辑器模式 | 特性 |
|------|------|-----------|------|
| `EditorCore.vue` | 完整功能编辑器 | 原生 + UEditor Plus 双模式 | 数据驱动工具栏、剪贴板清洗、CSS Custom Highlight API 选区可视化、持久化选区恢复、防抖修复 |
| `RangeWrap.vue` | 轻量独立编辑器 | 仅原生模式 | 基础格式工具栏、选区位置显示 |

`EditorCore.vue` 通过 `computed` 选择活跃的 composable（`active = isUEditorMode ? ue : native`），所有业务逻辑统一通过 `active` 访问，消除模式分支。

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
- `removeEmpty` 控制空标签是否自动移除

## 核心特性

### 修订冲突解决

参考 ProseMirror 的 `addMark` 设计，创建新修订时先移除所有冲突修订：

1. 完全移除冲突修订（保留文本内容）
2. 对非重叠部分重建同类型修订
3. 对重叠部分由新修订接管

这确保了同一段文本上不会有互相矛盾的修订标记。

### 剪贴板清洗

复制/剪切时自动清洗 HTML，移除 `copyable: false` 的语义容器（书签、修订），保留文本和内联样式：

```
用户复制 → handleCopyCut 拦截 → sanitizeHTML 清洗 → 写入剪贴板
```

### 选区持久化与恢复

`EditorCore.vue` 维护 `persistentSelection`，在样式操作导致失焦后自动恢复选区位置：

```
用户选中文本 → 持久化选区 → 点击工具栏 → 操作样式 → 恢复选区
```

原生模式额外使用 CSS Custom Highlight API 可视化选区（iframe 模式下跳过，因跨 iframe 不支持）。

### 防抖修复

用户输入后通过 `debouncedRepair`（300ms）自动修复跨块容器的非连续分片，确保书签等语义标记在编辑过程中保持完整。

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
│   │   ├── IRangeAdapter.ts    # 适配器接口定义 + ContainerTagConfig + WrapOptions
│   │   └── DOMRangeAdapter.ts  # DOM Range API 实现（含容器配置注册）
│   ├── models/
│   │   ├── Range.ts            # 文本选区抽象
│   │   ├── Bookmark.ts         # 书签数据模型（DOM 持久化、跨块拆分）
│   │   └── Revision.ts         # 修订数据模型（插入/删除语义、接受/拒绝规则）
│   ├── services/
│   │   ├── BookmarkService.ts  # 书签管理服务
│   │   └── RevisionService.ts  # 修订管理服务（含冲突解决、部分接受/拒绝）
│   ├── Editor.ts               # 统一业务 API
│   ├── utils.ts                # 工具函数（Unicode 字符长度、ID 生成等）
│   ├── styles.css              # 主文档语义元素样式
│   └── index.ts                # 模块导出
├── components/                  # Vue 组件层
│   ├── EditorCore.vue          # 双模式编辑器核心组件
│   ├── RangeWrap.vue           # 轻量独立编辑器组件
│   ├── DomTreePanel.vue        # DOM 树可视化面板
│   ├── RangeForm.vue           # 范围操作表单
│   ├── BaseButton.vue          # 基础按钮组件
│   ├── BaseInput.vue           # 基础输入组件
│   ├── editor-utils.ts         # 组件共享工具（EditorComposable 接口、格式状态）
│   ├── useNativeEditor.ts      # 原生编辑器 composable
│   ├── useUEditorPlus.ts       # UEditor Plus composable
│   └── index.ts                # 组件导出
├── views/
│   └── ComponentDemo.vue       # 组件演示页面
├── router/
│   └── index.ts                # 路由配置
├── __tests__/                   # 测试目录
│   ├── adapter.test.ts         # 适配器测试
│   ├── copy-cut.test.ts        # 复制/剪切清洗测试
│   ├── revision.test.ts        # 修订模型测试
│   ├── basic-test.test.ts      # 基础功能测试
│   ├── cross-block-revision.test.ts  # 跨块修订测试
│   ├── edge-cases.test.ts      # 边界用例测试
│   ├── perf-benchmark.test.ts  # 性能基准测试
│   ├── sanitize-html.test.ts   # HTML 清洗测试
│   └── split-repair.test.ts    # 拆分修复测试
├── App.vue                     # 主应用
├── AppRoot.vue                 # 应用根布局
├── main.ts                     # 入口
├── vite-plugin-auto-save-logs.ts  # 开发工具插件（日志收集 + 远程执行）
└── .dev-logs/
    ├── remote-exec.ts         # 一键远程执行 JS 脚本
    └── latest-errors.log      # 运行时日志（自动收集）
```

## 扩展新编辑器

集成一个新的 contenteditable 编辑器只需：

1. 创建 `useXxxEditor.ts` composable，实现 `EditorComposable` 接口
2. 在 `EditorCore.vue` 中注册新的模式选项

composable 内部只需封装编辑器特有的逻辑，核心功能（样式、书签、修订）通过 `DOMRangeAdapter` 直接获得。

对于非 DOM Range API 的编辑器（如 ProseMirror），需要实现 `IRangeAdapter` 接口的完全替代方案，但模型层和服务层无需任何修改。

## 测试

```bash
# 运行全部测试
pnpm tsx src/__tests__/adapter.test.ts
pnpm tsx src/__tests__/copy-cut.test.ts
pnpm tsx src/__tests__/revision.test.ts
pnpm tsx src/__tests__/basic-test.test.ts
pnpm tsx src/__tests__/cross-block-revision.test.ts
pnpm tsx src/__tests__/edge-cases.test.ts
pnpm tsx src/__tests__/perf-benchmark.test.ts
pnpm tsx src/__tests__/sanitize-html.test.ts
pnpm tsx src/__tests__/split-repair.test.ts

# 类型检查
pnpm tsc --noEmit
```

## 远程执行 JS

通过 `.dev-logs/remote-exec.ts` 一键在浏览器中执行 JS 代码并获取结果：

```bash
# 一次调用完成：写入 → 等待 → 输出最后 20 行日志
pnpm tsx .dev-logs/remote-exec.ts 'document.title'

# 指定输出行数
pnpm tsx .dev-logs/remote-exec.ts 'JSON.stringify({...})' 30

# UEditor Plus iframe 内的编辑器内容
pnpm tsx .dev-logs/remote-exec.ts 'document.querySelector("iframe").contentDocument.body.innerText'
```

原理：脚本将 JS 代码写入 `pending-js.txt`，浏览器每秒轮询读取并 `eval()` 执行，结果自动写入 `latest-errors.log`，脚本检测到日志更新后输出。

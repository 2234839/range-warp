- 禁止执行 dev 进行测试，可以使用 tsc 检测类型问题
- tailwindcss 不要使用 @apply ，组件化永远是更优选择

## 调试前端代码（vite-plugin-pilot）

**每次修改代码后都要主动使用 pilot 验证页面状态！**

前置条件：dev server 已启动，浏览器已打开页面

### 常用命令

```bash
npx pilot page          # 查看页面状态（compact snapshot）
npx pilot run 'code' page  # 执行 JS + 查看结果 + 页面状态（一步完成，推荐）
npx pilot run 'code' logs  # 执行 JS + 查看结果 + 控制台日志
npx pilot logs          # 查看最近控制台日志
npx pilot status        # 列出已连接的浏览器 tab
npx pilot help          # 查看辅助函数列表
```

### 工作流程
1. 修改代码
2. `npx pilot page` 查看页面状态，或 `npx pilot logs` 查看控制台日志
3. 发现问题则修复，反复迭代直到正常

### 辅助函数（浏览器端 JS）
- `__pilot_clickByText(t,n)` / `__pilot_click(i)` — 点击元素
- `__pilot_typeByPlaceholder(p,v)` — 按占位符输入（Vue/React 用这个）
- `__pilot_findByText(t)` — 查找元素
- `__pilot_waitFor(t,timeout,disappear)` — 等待元素出现/消失

**重要**：不要等用户去调试，主动查看日志并测试功能！

## 测试

测试脚本也使用 ts 编写，放在 src/__tests__ 目录下
可运行pnpm tsx src/__tests__/xxxx(对应的测试脚本).test.ts 来测试

运行全量测试：
```bash
for f in src/__tests__/*.test.ts; do pnpm tsx "$f" 2>&1 | grep -E '通过率|失败' | head -2; done
```

一些核心需要测试的功能修改后都应该执行对应的测试，核心功能的ts文件顶部应该使用注释说明对应的测试脚本路径

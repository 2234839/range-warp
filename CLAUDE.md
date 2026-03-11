- 禁止执行 dev 进行测试，可以使用 tsc 检测类型问题
- tailwindcss 不要使用 @apply ，组件化永远是更优选择

## 调试前端代码（工作流程）

**每次修改代码后都要主动查看网页运行日志来验证实现是否正确！**

### 网页运行日志系统
- 前端自动收集所有 console 输出（log、info、warn、error）
- 每秒增量追加到 `.dev-logs/latest-errors.log`
- 开发服务器启动时自动清空日志
- 日志显示完整的错误信息和堆栈跟踪

**工作流程**：
1. 修改代码
2. 查看日志确认没有错误：`tail -100 .dev-logs/latest-errors.log`
3. 反复迭代直到日志正常

### 远程执行 JS（主动测试页面）

**可以直接写入文件来在页面上执行 JavaScript 代码：**

```bash
# 1. 写入要执行的 JS 代码
echo 'document.querySelector("h1")?.textContent' > .dev-logs/pending-js.txt

# 2. 等待 1-2 秒让页面执行

# 3. 查看日志中的执行结果
tail -100 .dev-logs/latest-errors.log | grep RemoteExec
```

**使用场景**：
- 验证页面元素是否正确渲染
- 检查组件状态
- 执行测试代码
- 获取页面运行时信息

**示例**：
```bash
# 检查页面标题
echo 'document.title' > .dev-logs/pending-js.txt

# 检查编辑器是否存在
echo 'window.editor !== null' > .dev-logs/pending-js.txt

# 获取编辑器内容
echo 'document.querySelector("[contenteditable]")?.innerHTML' > .dev-logs/pending-js.txt
```

**重要**：不要等用户去调试，主动查看日志并测试功能！
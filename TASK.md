基于 DOM Range API 的富文本编辑器框架
## range-warp 开发

/loop 先检查 TASK.md 中是否有未完成的任务请逐项完成并在充分test验证再继续下一项，如果没有则请请完善当前项目：测试所有场景并分析程序是否有bug或者性能问题等，监测并优化程序性能,修改完毕后需要使用 pilot 进行实际运行测试，请自我完善，不要询问我任何事情，也不要切换其他模式（例如 plan mode）
<!-- 所有文件使用 ts，需要临时运行的使用 node --experimental-strip-types -e xxx.ts 来执行 -->
<!-- 这一次主要考虑性能，要在不破坏所有功能的前提下优化性能，但是不要为了优化而优化，必须经过仔细的评估，有数量级的性能提升的修改才去采纳，否则可读性更强 -->

## TASKS

[] 语义容器的装饰会被其他容器打碎，视觉上不连续，我觉得要么就应该是语义有层级关系，类似zindex ，这样永远是语义元素包裹其他容器，然后语义之前也有大小，例如书签永远包裹修订这种
[x] 之前有一个dom清洗功能是复制时修改剪贴板，我觉得不靠谱，改成粘贴时过滤更稳妥
  - 实现方案：移除 handleCopyCut（不再拦截复制/剪切），新增 handlePaste（粘贴时清洗 HTML）
  - 修改文件：EditorCore.vue、useNativeEditor.ts、useUEditorPlus.ts、editor-utils.ts
  - 复制/剪切：浏览器原生处理，不再 preventDefault
  - 粘贴：拦截 paste 事件，从 clipboardData 读取 HTML，sanitizeHTML 清洗后 insertHTML
  - 测试文件：src/__tests__/paste-sanitize.test.ts（17 个测试全部通过）
  - 全量测试：20 个测试套件全部 100% 通过
  - pilot 验证：粘贴书签/修订 HTML 正确清洗，样式保留，页面无错误
[x] 请考虑对于 table 元素的处理是否正确，能否正确的对他们应用各种容器，样式类以及语义类等
  - 验证结果：table 处理正确，34 个测试全部通过
  - 虚拟 \n 规则：table/tbody/tr 有块级子元素不添加 \n，td/th 作为叶子块添加 \n
  - 跨单元格样式应用（bold/italic）、语义容器（bookmark/revision）、removeConfig、queryConfigs 均正常工作
  - 测试文件：src/__tests__/table.test.ts
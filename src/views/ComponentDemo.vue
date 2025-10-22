<script setup lang="ts">
  import { ref } from 'vue';
  import BaseButton from '../components/BaseButton.vue';
  import BaseInput from '../components/BaseInput.vue';
  import RangeWrap from '../components/RangeWrap.vue';

  /** 演示数据 */
  const inputValue = ref('');
  const numberValue = ref(0);
  const disabledInput = ref('禁用的输入框');

  /** 处理按钮点击事件 */
  const handleButtonClick = (message: string) => {
    console.log('按钮点击:', message);
    alert(`点击了: ${message}`);
  };

  /** 处理输入事件 */
  const handleInput = (value: string | number, type: string) => {
    console.log(`${type}输入:`, value);
  };

  /** 处理清除事件 */
  const handleClear = () => {
    console.log('输入框已清除');
  };
</script>

<template>
  <div class="demo-container">
    <h1>组件库演示</h1>

    <!-- BaseButton 演示 -->
    <section class="demo-section">
      <h2>BaseButton 基础按钮组件</h2>

      <div class="demo-group">
        <h3>不同尺寸</h3>
        <div class="demo-items">
          <BaseButton size="small" @click="handleButtonClick('小按钮')">小按钮</BaseButton>
          <BaseButton size="medium" @click="handleButtonClick('中按钮')">中按钮</BaseButton>
          <BaseButton size="large" @click="handleButtonClick('大按钮')">大按钮</BaseButton>
        </div>
      </div>

      <div class="demo-group">
        <h3>不同风格</h3>
        <div class="demo-items">
          <BaseButton variant="primary" @click="handleButtonClick('主要按钮')">主要按钮</BaseButton>
          <BaseButton variant="secondary" @click="handleButtonClick('次要按钮')">次要按钮</BaseButton>
          <BaseButton variant="outline" @click="handleButtonClick('轮廓按钮')">轮廓按钮</BaseButton>
          <BaseButton variant="text" @click="handleButtonClick('文本按钮')">文本按钮</BaseButton>
        </div>
      </div>

      <div class="demo-group">
        <h3>不同状态</h3>
        <div class="demo-items">
          <BaseButton @click="handleButtonClick('普通按钮')">普通按钮</BaseButton>
          <BaseButton active @click="handleButtonClick('激活按钮')">激活按钮</BaseButton>
          <BaseButton disabled @click="handleButtonClick('禁用按钮')">禁用按钮</BaseButton>
        </div>
      </div>
    </section>

    <!-- BaseInput 演示 -->
    <section class="demo-section">
      <h2>BaseInput 基础输入框组件</h2>

      <div class="demo-group">
        <h3>不同尺寸</h3>
        <div class="demo-items">
          <BaseInput
            v-model="inputValue"
            size="small"
            placeholder="小输入框"
            @input="handleInput($event, '小输入框')"
          />
          <BaseInput
            v-model="inputValue"
            size="medium"
            placeholder="中输入框"
            @input="handleInput($event, '中输入框')"
          />
          <BaseInput
            v-model="inputValue"
            size="large"
            placeholder="大输入框"
            @input="handleInput($event, '大输入框')"
          />
        </div>
      </div>

      <div class="demo-group">
        <h3>不同类型</h3>
        <div class="demo-items">
          <BaseInput
            v-model="inputValue"
            type="text"
            placeholder="文本输入"
            @input="handleInput($event, '文本输入')"
          />
          <BaseInput
            v-model="numberValue"
            type="number"
            placeholder="数字输入"
            :min="0"
            :max="100"
            @input="handleInput($event, '数字输入')"
          />
          <BaseInput
            v-model="inputValue"
            type="email"
            placeholder="邮箱输入"
            @input="handleInput($event, '邮箱输入')"
          />
          <BaseInput
            v-model="inputValue"
            type="password"
            placeholder="密码输入"
            @input="handleInput($event, '密码输入')"
          />
        </div>
      </div>

      <div class="demo-group">
        <h3>不同状态</h3>
        <div class="demo-items">
          <BaseInput
            v-model="inputValue"
            placeholder="普通输入框"
            clearable
            @clear="handleClear"
            @input="handleInput($event, '普通输入框')"
          />
          <BaseInput
            v-model="disabledInput"
            placeholder="禁用的输入框"
            disabled
          />
          <BaseInput
            v-model="只读输入框"
            placeholder="只读的输入框"
            readonly
          />
        </div>
      </div>
    </section>

    <!-- RangeWrap 演示 -->
    <section class="demo-section">
      <h2>RangeWrap 富文本编辑器组件</h2>
      <p>这是一个功能完整的富文本编辑器，支持选中文本格式化和基于位置的范围操作。</p>

      <div class="demo-group">
        <h3>编辑器功能</h3>
        <ul class="feature-list">
          <li>工具栏按钮：加粗、斜体、下划线、删除线</li>
          <li>范围操作：通过表单精确控制文本位置和格式</li>
          <li>高亮功能：关键词高亮显示</li>
          <li>复制功能：复制HTML内容</li>
          <li>实时格式状态检测</li>
        </ul>

        <RangeWrap />
      </div>
    </section>

    <!-- 组件使用说明 -->
    <section class="demo-section">
      <h2>使用说明</h2>
      <div class="usage-info">
        <h3>全局安装</h3>
        <pre><code>import { createApp } from 'vue'
import { installComponents } from './components'

const app = createApp(App)
app.use({ install: installComponents })</code></pre>

        <h3>按需导入</h3>
        <pre><code>import { BaseButton, BaseInput } from './components'

export default {
  components: {
    BaseButton,
    BaseInput
  }
}</code></pre>
      </div>
    </section>
  </div>
</template>

<style lang="css" scoped>
  .demo-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    font-family: Arial, sans-serif;
  }

  h1 {
    color: #333;
    text-align: center;
    margin-bottom: 40px;
  }

  .demo-section {
    margin-bottom: 60px;
    padding: 20px;
    border: 1px solid #eee;
    border-radius: 8px;
    background-color: #fafafa;
  }

  .demo-section h2 {
    color: #007bff;
    border-bottom: 2px solid #007bff;
    padding-bottom: 8px;
    margin-bottom: 20px;
  }

  .demo-group {
    margin-bottom: 30px;
  }

  .demo-group h3 {
    color: #555;
    margin-bottom: 12px;
  }

  .demo-items {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
  }

  .demo-items > * {
    margin-bottom: 8px;
  }

  .feature-list {
    list-style-type: none;
    padding: 0;
  }

  .feature-list li {
    padding: 6px 0;
    border-bottom: 1px solid #eee;
    position: relative;
    padding-left: 20px;
  }

  .feature-list li:before {
    content: "✓";
    color: #28a745;
    font-weight: bold;
    position: absolute;
    left: 0;
  }

  .usage-info {
    background-color: #f8f9fa;
    padding: 20px;
    border-radius: 6px;
    border-left: 4px solid #007bff;
  }

  .usage-info h3 {
    color: #333;
    margin-top: 20px;
    margin-bottom: 10px;
  }

  .usage-info h3:first-child {
    margin-top: 0;
  }

  pre {
    background-color: #282c34;
    color: #abb2bf;
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 14px;
    line-height: 1.5;
  }

  code {
    background-color: #f1f3f4;
    padding: 2px 4px;
    border-radius: 3px;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 13px;
  }

  pre code {
    background-color: transparent;
    padding: 0;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .demo-container {
      padding: 16px;
    }

    .demo-items {
      flex-direction: column;
      align-items: stretch;
    }

    .demo-items > * {
      width: 100%;
    }
  }
</style>
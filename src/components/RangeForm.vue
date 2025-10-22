<script setup lang="ts">
  import { ref, watch } from 'vue';
  import BaseInput from './BaseInput.vue';
  import BaseButton from './BaseButton.vue';

  /** 文本格式操作类型 */
  type TextFormat = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'highlight';

  /** 表单组件的属性 */
  interface Props {
    /** 起始位置 */
    start?: number;
    /** 结束位置 */
    end?: number;
    /** 默认选中的格式 */
    defaultFormat?: TextFormat;
    /** 是否禁用 */
    disabled?: boolean;
  }

  /** 表单组件的事件 */
  interface Emits {
    /** 确认操作事件 */
    confirm: [start: number, end: number, format: TextFormat];
    /** 取消操作事件 */
    cancel: [];
  }

  const props = withDefaults(defineProps<Props>(), {
    start: 0,
    end: 0,
    defaultFormat: 'bold',
    disabled: false
  });

  const emit = defineEmits<Emits>();

  /** 表单数据 */
  const formData = ref({
    start: props.start,
    end: props.end,
    format: props.defaultFormat as TextFormat
  });

  /** 可用的格式选项 */
  const formatOptions = [
    { value: 'bold', label: '加粗', icon: 'B', tag: 'strong' },
    { value: 'italic', label: '斜体', icon: 'I', tag: 'em' },
    { value: 'underline', label: '下划线', icon: 'U', tag: 'u' },
    { value: 'strikethrough', label: '删除线', icon: 'S', tag: 's' },
    { value: 'highlight', label: '高亮', icon: 'H', tag: 'mark' }
  ] as const;

  /** 监听props变化更新表单数据 */
  watch(() => props.start, (newStart) => {
    formData.value.start = newStart;
  });

  watch(() => props.end, (newEnd) => {
    formData.value.end = newEnd;
  });

  /** 验证表单数据 */
  const validateForm = () => {
    if (formData.value.start < 0) {
      throw new Error('起始位置不能小于0');
    }
    if (formData.value.end < formData.value.start) {
      throw new Error('结束位置不能小于起始位置');
    }
    return true;
  };

  /** 处理确认操作 */
  const handleConfirm = () => {
    try {
      validateForm();
      emit('confirm', formData.value.start, formData.value.end, formData.value.format);
    } catch (error) {
      console.error('表单验证失败:', error);
      // 这里可以添加错误提示，例如使用toast或alert
      alert(error instanceof Error ? error.message : '表单验证失败');
    }
  };

  /** 处理取消操作 */
  const handleCancel = () => {
    emit('cancel');
  };

  /** 获取格式的显示样式 */
  const getFormatStyle = (format: TextFormat) => {
    switch (format) {
      case 'bold':
        return 'font-weight: bold;';
      case 'italic':
        return 'font-style: italic;';
      case 'underline':
        return 'text-decoration: underline;';
      case 'strikethrough':
        return 'text-decoration: line-through;';
      case 'highlight':
        return 'background-color: yellow; padding: 1px 2px;';
      default:
        return '';
    }
  };
</script>

<template>
  <div class="range-form">
    <div class="range-form__header">
      <h3 class="range-form__title">文本范围操作</h3>
    </div>

    <div class="range-form__body">
      <!-- 位置输入区域 -->
      <div class="range-form__group">
        <label class="range-form__label">位置范围</label>
        <div class="range-form__position-inputs">
          <BaseInput
            v-model.number="formData.start"
            type="number"
            placeholder="起始位置"
            :min="0"
            :disabled="disabled"
            size="small"
            width="120px"
          />
          <span class="range-form__separator">至</span>
          <BaseInput
            v-model.number="formData.end"
            type="number"
            placeholder="结束位置"
            :min="formData.start"
            :disabled="disabled"
            size="small"
            width="120px"
          />
        </div>
      </div>

      <!-- 格式选择区域 -->
      <div class="range-form__group">
        <label class="range-form__label">操作类型</label>
        <div class="range-form__format-options">
          <button
            v-for="option in formatOptions"
            :key="option.value"
            type="button"
            :class="[
              'range-form__format-btn',
              { 'range-form__format-btn--active': formData.format === option.value }
            ]"
            :disabled="disabled"
            :title="option.label"
            :style="getFormatStyle(option.value)"
            @click="formData.format = option.value as TextFormat">
            {{ option.icon }}
          </button>
        </div>
      </div>

      <!-- 格式说明 -->
      <div class="range-form__description">
        <span class="range-form__description-label">当前操作：</span>
        <span class="range-form__description-value">
          {{ formatOptions.find(opt => opt.value === formData.format)?.label }}
        </span>
      </div>
    </div>

    <!-- 操作按钮区域 -->
    <div class="range-form__footer">
      <BaseButton
        variant="primary"
        :disabled="disabled"
        @click="handleConfirm">
        确定
      </BaseButton>
      <BaseButton
        variant="outline"
        :disabled="disabled"
        @click="handleCancel">
        取消
      </BaseButton>
    </div>
  </div>
</template>

<style lang="css" scoped>
  .range-form {
    background: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 16px;
    min-width: 320px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .range-form__header {
    margin-bottom: 16px;
  }

  .range-form__title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #333;
  }

  .range-form__body {
    margin-bottom: 16px;
  }

  .range-form__group {
    margin-bottom: 12px;
  }

  .range-form__label {
    display: block;
    margin-bottom: 6px;
    font-size: 14px;
    font-weight: 500;
    color: #555;
  }

  .range-form__position-inputs {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .range-form__separator {
    color: #666;
    font-size: 14px;
  }

  .range-form__format-options {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .range-form__format-btn {
    width: 32px;
    height: 32px;
    border: 1px solid #ccc;
    background: white;
    border-radius: 3px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    font-family: inherit;
  }

  .range-form__format-btn:hover:not(:disabled) {
    background-color: #e9e9e9;
    border-color: #999;
  }

  .range-form__format-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .range-form__format-btn--active {
    background-color: #007bff;
    color: white;
    border-color: #0056b3;
  }

  .range-form__format-btn--active:hover {
    background-color: #0056b3;
  }

  .range-form__format-btn:focus-visible {
    outline: 2px solid #007bff;
    outline-offset: 2px;
  }

  .range-form__description {
    margin-top: 12px;
    padding: 8px;
    background-color: #f8f9fa;
    border-radius: 4px;
    font-size: 14px;
  }

  .range-form__description-label {
    color: #666;
  }

  .range-form__description-value {
    font-weight: 500;
    color: #333;
  }

  .range-form__footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  /* 响应式设计 */
  @media (max-width: 480px) {
    .range-form {
      min-width: 280px;
      padding: 12px;
    }

    .range-form__position-inputs {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }

    .range-form__separator {
      text-align: center;
    }

    .range-form__footer {
      flex-direction: column;
    }
  }
</style>
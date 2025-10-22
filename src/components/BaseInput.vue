<script setup lang="ts">
  import { computed } from 'vue';

  /** 输入框组件的基础属性 */
  interface Props {
    /** 输入框类型 */
    type?: 'text' | 'number' | 'email' | 'password' | 'tel' | 'url';
    /** 输入框尺寸 */
    size?: 'small' | 'medium' | 'large';
    /** 占位符文本 */
    placeholder?: string;
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否只读 */
    readonly?: boolean;
    /** 是否必填 */
    required?: boolean;
    /** 最大长度 */
    maxlength?: number;
    /** 最小长度 */
    minlength?: number;
    /** 最小值（number类型） */
    min?: number;
    /** 最大值（number类型） */
    max?: number;
    /** 步长（number类型） */
    step?: number;
    /** 输入框宽度 */
    width?: string;
    /** 自动完成类型 */
    autocomplete?: string;
    /** 输入模式 */
    inputmode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
    /** 是否显示清除按钮 */
    clearable?: boolean;
  }

  /** 输入框组件的事件 */
  interface Emits {
    input: [value: string | number];
    change: [value: string | number];
    focus: [event: FocusEvent];
    blur: [event: FocusEvent];
    keydown: [event: KeyboardEvent];
    keyup: [event: KeyboardEvent];
    clear: [];
  }

  const props = withDefaults(defineProps<Props>(), {
    type: 'text',
    size: 'medium',
    disabled: false,
    readonly: false,
    required: false,
    clearable: false
  });

  const emit = defineEmits<Emits>();

  /** 输入框的值 */
  const modelValue = defineModel<string | number>();

  /** 处理输入事件 */
  const handleInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const value = props.type === 'number' ? Number(target.value) || 0 : target.value;
    modelValue.value = value;
    emit('input', value);
  };

  /** 处理变化事件 */
  const handleChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const value = props.type === 'number' ? Number(target.value) || 0 : target.value;
    emit('change', value);
  };

  /** 处理焦点事件 */
  const handleFocus = (event: FocusEvent) => {
    emit('focus', event);
  };

  /** 处理失焦事件 */
  const handleBlur = (event: FocusEvent) => {
    emit('blur', event);
  };

  /** 处理键盘按下事件 */
  const handleKeydown = (event: KeyboardEvent) => {
    emit('keydown', event);
  };

  /** 处理键盘抬起事件 */
  const handleKeyup = (event: KeyboardEvent) => {
    emit('keyup', event);
  };

  /** 清除输入内容 */
  const clearInput = () => {
    modelValue.value = props.type === 'number' ? 0 : '';
    emit('clear');
  };

  /** 根据尺寸获取高度 */
  const getHeightBySize = (size: string) => {
    switch (size) {
      case 'small':
        return '24px';
      case 'large':
        return '40px';
      default:
        return '32px';
    }
  };

  /** 根据尺寸获取内边距 */
  const getPaddingBySize = (size: string) => {
    switch (size) {
      case 'small':
        return '4px 8px';
      case 'large':
        return '8px 12px';
      default:
        return '6px 12px';
    }
  };

  /** 是否显示清除按钮 */
  const showClearButton = computed(() => {
    return props.clearable && modelValue.value && !props.disabled && !props.readonly;
  });
</script>

<template>
  <div class="base-input-wrapper" :style="{ width: width || '100%' }">
    <input
      v-model="modelValue"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :required="required"
      :maxlength="maxlength"
      :minlength="minlength"
      :min="min"
      :max="max"
      :step="step"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :class="[
        'base-input',
        `base-input--${size}`,
        { 'base-input--with-clear': showClearButton }
      ]"
            @input="handleInput"
      @change="handleChange"
      @focus="handleFocus"
      @blur="handleBlur"
      @keydown="handleKeydown"
      @keyup="handleKeyup"
    />

    <!-- 清除按钮 -->
    <button
      v-if="showClearButton"
      type="button"
      class="base-input__clear"
      :style="{
        width: getHeightBySize(size),
        height: getHeightBySize(size)
      }"
      @click="clearInput"
      title="清除">
      ×
    </button>
  </div>
</template>

<style lang="css" scoped>
  .base-input-wrapper {
    position: relative;
    display: inline-block;
  }

  .base-input {
    border: 1px solid #ccc;
    border-radius: 3px;
    font-size: 14px;
    font-family: inherit;
    box-sizing: border-box;
    outline: none;
    transition: all 0.2s ease;
    width: 100%;
  }

  .base-input:hover:not(:disabled):not(:read-only) {
    border-color: #999;
  }

  .base-input:focus {
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
  }

  .base-input:disabled {
    background-color: #f5f5f5;
    opacity: 0.6;
    cursor: not-allowed;
  }

  .base-input:read-only {
    background-color: #f9f9f9;
    cursor: default;
  }

  /* 尺寸变体 */
  .base-input--small {
    font-size: 12px;
  }

  .base-input--large {
    font-size: 16px;
  }

  /* 带清除按钮的输入框 */
  .base-input--with-clear {
    padding-right: 32px !important;
  }

  /* 清除按钮 */
  .base-input__clear {
    position: absolute;
    right: 1px;
    top: 50%;
    transform: translateY(-50%);
    border: none;
    background: none;
    cursor: pointer;
    color: #999;
    font-size: 16px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    transition: all 0.2s ease;
  }

  .base-input__clear:hover {
    color: #666;
    background-color: rgba(0, 0, 0, 0.1);
  }

  .base-input__clear:focus {
    outline: 2px solid #007bff;
    outline-offset: 1px;
  }

  /* 输入框与清除按钮的交互 */
  .base-input--with-clear:focus + .base-input__clear {
    color: #007bff;
  }
</style>
import { TagsInput } from '@mantine/core';

interface Props {
  label: string;
  description?: string;
  placeholder?: string;
  value: string[];
  onChange: (value: string[]) => void;
}

export function MultiInput({ label, description, placeholder, value, onChange }: Props) {
  return (
    <TagsInput
      label={label}
      description={description}
      placeholder={placeholder || "Введите число и жмите Enter"}
      value={value}
      onChange={onChange}
      clearable
      // Разрешаем вводить только цифры и точки (валидация на лету)
      onKeyDown={(e) => {
        if (!/[0-9.]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Enter' && e.key !== 'Tab') {
          e.preventDefault();
        }
      }}
      styles={{
        input: { fontFamily: 'monospace' } // Чтобы цифры смотрелись ровно
      }}
    />
  );
}
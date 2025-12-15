import { TagsInput } from '@mantine/core';

interface Props {
  label: string;
  description?: string;
  placeholder?: string;
  data: string[]; // Список предустановленных значений
  value: string[];
  onChange: (value: string[]) => void;
}

export function SmartMultiSelect({ label, description, placeholder, data, value, onChange }: Props) {
  return (
    <TagsInput
      label={label}
      description={description}
      placeholder={placeholder || "Выберите или введите..."}
      data={data} // Mantine покажет эти значения как подсказки
      value={value}
      onChange={onChange}
      clearable
      // splitChars позволяет вставить строку "10, 20" и она сама превратится в два тега
      splitChars={[',', ' ', '|']} 
      maxDropdownHeight={200}
    />
  );
}
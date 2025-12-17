import { TagsInput } from '@mantine/core';

interface Props {
  label: string;
  description?: string;
  placeholder?: string;
  value: string[];
  onChange: (value: string[]) => void;
}

export function MultiInput({ label, description, placeholder, value, onChange }: Props) {
  
  // Обработчик изменений: заменяем запятые на точки во всех введенных значениях
  const handleChange = (newTags: string[]) => {
    const sanitizedTags = newTags.map(tag => tag.replace(/,/g, '.'));
    onChange(sanitizedTags);
  };

  return (
    <TagsInput
      label={label}
      description={description}
      placeholder={placeholder || "Введите значение и нажмите Enter"}
      value={value}
      onChange={handleChange}
      clearable
      // Убираем запятую из разделителей, чтобы она попадала в значение (0,1), 
      // а потом мы её заменим на точку в handleChange
      splitChars={[' ', 'Enter']} 
      
      onKeyDown={(e) => {
        // Разрешаем служебные клавиши (удаление, навигация, Enter, Tab)
        const allowedKeys = [
            'Backspace', 'Delete', 'Tab', 'Enter', 
            'ArrowLeft', 'ArrowRight', 'Home', 'End'
        ];
        if (allowedKeys.includes(e.key)) return;
        
        // Разрешаем Ctrl+C, Ctrl+V, Ctrl+A
        if (e.ctrlKey || e.metaKey) return;

        // Разрешаем только цифры, точку и запятую
        // (Запятую разрешаем, чтобы пользователь мог её нажать, а мы её заменим)
        if (!/[0-9.,]/.test(e.key)) {
          e.preventDefault();
        }
      }}
      styles={{
        input: { fontFamily: 'monospace' } 
      }}
    />
  );
}
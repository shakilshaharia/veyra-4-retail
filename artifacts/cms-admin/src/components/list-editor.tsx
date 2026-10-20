import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { move } from './sortable';
import { Button, IconButton, Input } from './ui';

// An ordered list of short strings: dropdown options, bullet points.
export function StringListEditor({ label, values, onChange, placeholder, addLabel = 'Add item', hint, max = 12 }: {
  label: ReactNode;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  hint?: ReactNode;
  max?: number;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-[13px] font-medium text-zinc-800">{label}</legend>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      <ul className="space-y-1.5">
        {values.map((value, index) => (
          <li key={index} className="flex items-center gap-1">
            <Input
              id={`${id}-${index}`}
              value={value}
              placeholder={placeholder}
              aria-label={`${typeof label === 'string' ? label : 'Item'} ${index + 1}`}
              onChange={(event) => onChange(values.map((item, i) => (i === index ? event.target.value : item)))}
              className="h-9"
            />
            <IconButton label="Move up" disabled={index === 0} onClick={() => onChange(move(values, index, -1))}><ArrowUp /></IconButton>
            <IconButton label="Move down" disabled={index === values.length - 1} onClick={() => onChange(move(values, index, 1))}><ArrowDown /></IconButton>
            <IconButton label="Remove" onClick={() => onChange(values.filter((_, i) => i !== index))} className="hover:text-red-600"><Trash2 /></IconButton>
          </li>
        ))}
      </ul>
      {values.length < max && (
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => onChange([...values, ''])}>
          {addLabel}
        </Button>
      )}
    </fieldset>
  );
}

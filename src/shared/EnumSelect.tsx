
import React from 'react';
import { FORM_SELECT_CLASS } from './ui/Components';

interface Option {
  id: string;
  label: string;
}

interface EnumSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly Option[];
  label?: string;
  includeAllOption?: boolean;
  allLabel?: string;
}

export const EnumSelect: React.FC<EnumSelectProps> = ({ 
  options, 
  label, 
  includeAllOption, 
  allLabel = 'All', 
  className = '',
  ...props 
}) => {
  return (
    <div className={label ? "space-y-1" : ""}>
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
      <select 
        className={`${FORM_SELECT_CLASS} ${className}`} 
        {...props}
      >
        {includeAllOption && <option value="all">{allLabel}</option>}
        {options.map(opt => (
          <option key={opt.id} value={opt.id}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
};

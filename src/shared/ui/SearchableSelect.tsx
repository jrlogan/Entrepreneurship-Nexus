
import React, { useState, useEffect, useRef } from 'react';
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS } from './Components';

interface Option {
    id: string;
    label: string;
    subLabel?: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label?: string;
    className?: string;
}

export const SearchableSelect = ({ options, value, onChange, placeholder = "Select...", label, className }: SearchableSelectProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Get selected label
    const selectedOption = options.find(o => o.id === value);

    // Filter options
    const filteredOptions = options.filter(o => 
        o.label.toLowerCase().includes(search.toLowerCase()) || 
        (o.subLabel && o.subLabel.toLowerCase().includes(search.toLowerCase()))
    );

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (id: string) => {
        onChange(id);
        setIsOpen(false);
        setSearch('');
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            {label && <label className={FORM_LABEL_CLASS}>{label}</label>}
            
            <div 
                className={`${FORM_INPUT_CLASS} cursor-pointer flex items-center justify-between bg-white`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={selectedOption ? 'text-gray-900' : 'text-gray-400'}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <span className="text-gray-400 text-xs">▼</span>
            </div>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white rounded-md shadow-lg border border-gray-200 max-h-60 flex flex-col">
                    <div className="p-2 border-b border-gray-100 sticky top-0 bg-white rounded-t-md">
                        <input
                            autoFocus
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 bg-white text-gray-900 placeholder-gray-500"
                            placeholder="Search..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="overflow-y-auto flex-1 p-1">
                        {filteredOptions.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500 italic">No matches found.</div>
                        ) : (
                            filteredOptions.map(opt => (
                                <div
                                    key={opt.id}
                                    onClick={() => handleSelect(opt.id)}
                                    className={`px-3 py-2 text-sm cursor-pointer rounded hover:bg-indigo-50 flex flex-col ${value === opt.id ? 'bg-indigo-50 font-medium' : 'text-gray-700'}`}
                                >
                                    <span>{opt.label}</span>
                                    {opt.subLabel && <span className="text-xs text-gray-400">{opt.subLabel}</span>}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};


import React, { useState } from 'react';
import { Badge } from './Components';

interface TagManagerProps {
    assignedTags: string[];
    availableTags: string[]; // From Ecosystem config
    onUpdate: (tags: string[]) => void;
    editable: boolean;
}

export const TagManager = ({ assignedTags = [], availableTags = [], onUpdate, editable }: TagManagerProps) => {
    const [isAdding, setIsAdding] = useState(false);
    const [selectedTag, setSelectedTag] = useState('');

    const handleRemove = (tag: string) => {
        if (!editable) return;
        onUpdate(assignedTags.filter(t => t !== tag));
    };

    const handleAdd = () => {
        if (!selectedTag) return;
        if (!assignedTags.includes(selectedTag)) {
            onUpdate([...assignedTags, selectedTag]);
        }
        setIsAdding(false);
        setSelectedTag('');
    };

    // Filter available tags to only those not yet assigned
    const options = availableTags.filter(t => !assignedTags.includes(t));

    return (
        <div className="flex flex-wrap items-center gap-2">
            {assignedTags.map(tag => (
                <div key={tag} className="group relative inline-flex">
                    <Badge color="blue">{tag}</Badge>
                    {editable && (
                        <button 
                            onClick={() => handleRemove(tag)}
                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove Tag"
                        >
                            &times;
                        </button>
                    )}
                </div>
            ))}
            
            {editable && (
                <div className="relative">
                    {!isAdding ? (
                        <button 
                            onClick={() => setIsAdding(true)}
                            className="text-xs text-gray-500 border border-dashed border-gray-300 rounded px-2 py-0.5 hover:border-indigo-500 hover:text-indigo-600 transition-colors"
                        >
                            + Tag
                        </button>
                    ) : (
                        <div className="flex items-center gap-1 animate-in fade-in zoom-in duration-100">
                            <select 
                                autoFocus
                                className="text-xs border border-gray-300 rounded py-0.5 px-1 w-32 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                value={selectedTag}
                                onChange={e => setSelectedTag(e.target.value)}
                                onBlur={() => setTimeout(() => setIsAdding(false), 200)} // Delay to allow click on save
                            >
                                <option value="">Select...</option>
                                {options.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                            <button 
                                onMouseDown={handleAdd} // Use onMouseDown to trigger before blur
                                className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded hover:bg-indigo-700"
                            >
                                Add
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

import React, { useState } from 'react';
import { CONFIG } from '../../app/config';

export interface CardProps {
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ title, children, className = '', action }) => (
  <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 rounded-t-lg flex justify-between items-center">
      <h3 className="font-semibold text-gray-800">{title}</h3>
      {action && <div>{action}</div>}
    </div>
    <div className="p-6">
      {children}
    </div>
  </div>
);

export interface BadgeProps {
  children?: React.ReactNode;
  color?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, color = 'blue' }) => {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800',
    purple: 'bg-purple-100 text-purple-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    gray: 'bg-gray-100 text-gray-800',
    red: 'bg-red-100 text-red-800',
    indigo: 'bg-indigo-100 text-indigo-800',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
};

export const InfoBanner: React.FC<{ title: string, children?: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6 flex gap-3 animate-in fade-in slide-in-from-top-2">
    <div className="text-blue-600 text-lg mt-0.5">ℹ️</div>
    <div>
      <h4 className="font-bold text-blue-900 text-sm mb-1">{title}</h4>
      <div className="text-sm text-blue-800 leading-relaxed space-y-1">
        {children}
      </div>
    </div>
  </div>
);

export interface SidebarItemProps {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  textColor: string;
  iconColor: string;
  hoverClass: string;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({ active, onClick, label, icon, textColor, iconColor, hoverClass }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center space-x-3 px-4 py-3 transition-colors ${
      active ? 'bg-white/10 text-white' : `${textColor} ${hoverClass} hover:text-white`
    }`}
  >
    <div className={`flex-shrink-0 ${active ? 'text-white' : iconColor}`}>{icon}</div>
    <span className="font-medium text-sm">{label}</span>
  </button>
);

export const Modal = ({ isOpen, onClose, title, wide, children }: { isOpen: boolean, onClose: () => void, title: string, wide?: boolean, children?: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
      <div className={`bg-white rounded-lg shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} p-6 m-4 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto relative`}>
        <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const DemoWarningBanner = () => (
  <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-4 py-1 text-center text-xs font-bold tracking-wide shadow-md">
    ⚠ DEMO ENVIRONMENT: All data is temporary and will reset upon page reload.
  </div>
);

export const CodeBlock = ({ code, language = 'bash' }: { code: string, language?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-md overflow-hidden bg-slate-900 border border-slate-800">
      <div className="flex justify-between items-center px-4 py-2 bg-slate-800 border-b border-slate-700">
        <span className="text-xs font-mono text-slate-400">{language}</span>
        <button 
          onClick={handleCopy} 
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm font-mono text-slate-100 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
};

// --- Demo Link Interceptor ---
export interface DemoLinkProps {
    href: string; // Kept for semantics, though handled internally
    children?: React.ReactNode;
    className?: string;
    description?: string;
    title?: string;
}

export const DemoLink: React.FC<DemoLinkProps> = ({ href, children, className, title = "External Resource", description = "In a live environment, this would open an external website or tool." }) => {
    const [showModal, setShowModal] = useState(false);

    if (!CONFIG.IS_DEMO_MODE) {
        return (
            <a
                href={href}
                className={className}
                title={title}
                target={href.startsWith('http://') || href.startsWith('https://') ? '_blank' : undefined}
                rel={href.startsWith('http://') || href.startsWith('https://') ? 'noreferrer' : undefined}
            >
                {children}
            </a>
        );
    }

    return (
        <>
            <a 
                href={href} 
                className={className} 
                onClick={(e) => { e.preventDefault(); setShowModal(true); }}
                title={title}
            >
                {children}
            </a>
            
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Demo Feature">
                <div className="text-center py-4">
                    <div className="text-4xl mb-4">🚧</div>
                    <h4 className="text-lg font-bold text-gray-800 mb-2">{title}</h4>
                    <p className="text-gray-600 text-sm mb-4">{description}</p>
                    <div className="bg-gray-100 p-3 rounded text-xs font-mono text-gray-500 break-all border border-gray-200">
                        Target: {href}
                    </div>
                    <button 
                        onClick={() => setShowModal(false)}
                        className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-bold"
                    >
                        Got it
                    </button>
                </div>
            </Modal>
        </>
    );
};

// --- Images & Avatars ---

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ src, name, size = 'md', className = '' }) => {
  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-16 h-16 text-xl',
    xl: 'w-24 h-24 text-3xl',
    '2xl': 'w-32 h-32 text-4xl'
  };

  const initials = name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Deterministic color based on name length
  const colors = ['bg-indigo-100 text-indigo-600', 'bg-green-100 text-green-600', 'bg-blue-100 text-blue-600', 'bg-purple-100 text-purple-600', 'bg-pink-100 text-pink-600'];
  const colorClass = colors[name.length % colors.length];

  return (
    <div className={`relative inline-block rounded-full overflow-hidden flex-shrink-0 ${sizeClasses[size]} ${className}`}>
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div className={`w-full h-full flex items-center justify-center font-bold ${colorClass}`}>
          {initials}
        </div>
      )}
    </div>
  );
};

interface CompanyLogoProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const CompanyLogo: React.FC<CompanyLogoProps> = ({ src, name, size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-lg',
    lg: 'w-16 h-16 text-xl',
    xl: 'w-24 h-24 text-2xl',
  };

  const initial = name.substring(0, 1).toUpperCase();
  // Deterministic grayscale/monochrome feel for orgs
  const colors = ['bg-gray-100 text-gray-600', 'bg-slate-100 text-slate-600', 'bg-zinc-100 text-zinc-600'];
  const colorClass = colors[name.length % colors.length];

  return (
    <div className={`relative inline-block rounded-lg overflow-hidden flex-shrink-0 border border-gray-200 ${sizeClasses[size]} ${className}`}>
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-contain p-1 bg-white" />
      ) : (
        <div className={`w-full h-full flex items-center justify-center font-bold ${colorClass}`}>
          {initial}
        </div>
      )}
    </div>
  );
};

// Constants for forms
export const FORM_LABEL_CLASS = "block text-sm font-medium text-gray-700 mb-1";
export const FORM_INPUT_CLASS = "block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border";
export const FORM_SELECT_CLASS = "block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border";
export const FORM_TEXTAREA_CLASS = "block w-full rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border";

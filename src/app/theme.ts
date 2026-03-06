
import { SystemRole } from '../domain/types';

export interface SidebarTheme {
  sidebarBg: string;
  sidebarBorder: string;
  headerTitle: string;
  headerSub: string;
  footerBg: string;
  footerBorder: string;
  itemText: string;
  itemIcon: string;
  itemHover: string;
  contextLabel: string; // Label for the badge in footer
  contextColor: string; // Color for the badge in footer
}

export const THEMES = {
  default: { // ESO Admin, Staff
    sidebarBg: 'bg-slate-900',
    sidebarBorder: 'border-slate-800',
    headerTitle: 'text-indigo-500',
    headerSub: 'text-slate-500',
    footerBg: 'bg-slate-800',
    footerBorder: 'border-slate-700',
    itemText: 'text-slate-400',
    itemIcon: 'text-indigo-400',
    itemHover: 'hover:bg-white/5',
    contextLabel: 'ESO View',
    contextColor: 'bg-indigo-600'
  },
  entrepreneur: { // Client / Founder
    sidebarBg: 'bg-indigo-900',
    sidebarBorder: 'border-indigo-800',
    headerTitle: 'text-white',
    headerSub: 'text-indigo-300',
    footerBg: 'bg-indigo-800',
    footerBorder: 'border-indigo-700',
    itemText: 'text-indigo-200',
    itemIcon: 'text-indigo-300',
    itemHover: 'hover:bg-white/10',
    contextLabel: 'Client Portal',
    contextColor: 'bg-white/20'
  },
  admin: { // System Admin
    sidebarBg: 'bg-zinc-900',
    sidebarBorder: 'border-zinc-800',
    headerTitle: 'text-emerald-500',
    headerSub: 'text-zinc-500',
    footerBg: 'bg-black',
    footerBorder: 'border-zinc-800',
    itemText: 'text-zinc-400',
    itemIcon: 'text-emerald-600',
    itemHover: 'hover:bg-zinc-800',
    contextLabel: 'System Admin',
    contextColor: 'bg-emerald-700'
  }
};

export const getTheme = (role: SystemRole): SidebarTheme => {
  if (role === 'entrepreneur') return THEMES.entrepreneur;
  if (role === 'platform_admin' || role === 'ecosystem_manager') return THEMES.admin;
  return THEMES.default;
};

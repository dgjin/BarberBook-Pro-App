import React from 'react';
import { NavItem, PageRoute, UserRole } from '../types';

interface BottomNavProps {
  activeRoute: PageRoute;
  onNavigate: (route: PageRoute) => void;
  userRole: UserRole;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeRoute, onNavigate, userRole }) => {
  
  const customerNav: NavItem[] = [
    { id: 'home', icon: 'home', label: '首页', route: 'home' },
    { id: 'booking', icon: 'calendar_today', label: '预约', route: 'booking' },
    { id: 'ai', icon: 'auto_awesome', label: 'AI 顾问', route: 'ai_chat', fill: true },
    { id: 'profile', icon: 'person', label: '个人中心', route: 'check_in' },
  ];

  const barberNav: NavItem[] = [
    { id: 'workbench', icon: 'content_cut', label: '工作台', route: 'admin_workbench' },
    { id: 'monitor', icon: 'tv', label: '监控屏', route: 'monitor' },
    { id: 'profile', icon: 'account_circle', label: '我的', route: 'admin_settings' }, // Barber profile could be simple settings
  ];

  const adminNav: NavItem[] = [
    { id: 'dashboard', icon: 'dashboard', label: '看板', route: 'admin_dashboard' },
    { id: 'manage', icon: 'group', label: '人员', route: 'admin_management' },
    { id: 'logs', icon: 'history', label: '日志', route: 'admin_logs' },
    { id: 'settings', icon: 'settings', label: '设置', route: 'admin_settings' },
  ];

  let items: NavItem[] = [];
  if (userRole === 'customer') items = customerNav;
  else if (userRole === 'barber') items = barberNav;
  else items = adminNav;

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 ios-blur border-t border-gray-100 pb-8 pt-2 px-6 z-50">
      <div className="flex justify-between items-center">
        {items.map((item) => {
          const isActive = activeRoute === item.route;
          const colorClass = isActive ? 'text-primary' : 'text-text-secondary hover:text-gray-600';
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.route)}
              className={`flex flex-col items-center gap-1 transition-colors w-16 ${colorClass}`}
            >
              <span 
                className={`material-symbols-outlined text-[26px] transition-all ${isActive && item.fill ? 'font-variation-fill' : ''}`}
                style={isActive || item.fill ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {item.icon}
              </span>
              <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
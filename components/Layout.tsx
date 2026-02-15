import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, className = '' }) => {
  return (
    <div className={`max-w-md mx-auto min-h-screen bg-bg-main relative shadow-2xl overflow-hidden flex flex-col ${className}`}>
      {children}
      {/* Home Indicator */}
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-black/10 rounded-full z-[60] pointer-events-none mix-blend-multiply"></div>
    </div>
  );
};

export const Header: React.FC<{
  title?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  transparent?: boolean;
  className?: string;
}> = ({ title, left, right, transparent = false, className = '' }) => {
  return (
    <header className={`pt-12 pb-4 px-6 flex items-center justify-between sticky top-0 z-40 transition-all ${
      transparent ? 'bg-transparent' : 'bg-white/80 ios-blur border-b border-gray-100'
    } ${className}`}>
      <div className="flex-shrink-0 w-10 flex items-center justify-start">
        {left}
      </div>
      <h1 className="text-lg font-bold text-text-main flex-1 text-center truncate px-2">{title}</h1>
      <div className="flex-shrink-0 w-10 flex items-center justify-end">
        {right}
      </div>
    </header>
  );
};

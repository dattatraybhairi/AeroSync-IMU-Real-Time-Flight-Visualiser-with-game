import React from 'react';
import { Code, Sun, Moon } from 'lucide-react';

interface TopNavProps {
  onOpenCodeModal: () => void;
  onNavigateSection: (section: 'fleet' | 'device_imu' | 'serial' | 'calibration') => void;
  activeSection: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  onOpenCodeModal,
  onNavigateSection,
  activeSection,
  darkMode,
  onToggleDarkMode,
}) => {
  return (
    <header className="relative z-40 flex items-center justify-between gap-8 px-6 py-3.5 bg-white/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 shadow-xs select-none transition-colors">
      {/* Zone 1: Single text element wordmark */}
      <a
        href="#top"
        onClick={(e) => {
          e.preventDefault();
          onNavigateSection('fleet');
        }}
        className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
      >
        AeroSync IMU
      </a>

      {/* Zone 2: 4 concise single-line text navigation links */}
      <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600 dark:text-slate-400">
        <button
          type="button"
          onClick={() => onNavigateSection('fleet')}
          className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeSection === 'fleet'
              ? 'text-sky-600 dark:text-sky-400 underline underline-offset-4 font-bold'
              : ''
          }`}
        >
          Airbus & Boeing
        </button>
        <button
          type="button"
          onClick={() => onNavigateSection('device_imu')}
          className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeSection === 'device_imu'
              ? 'text-sky-600 dark:text-sky-400 underline underline-offset-4 font-bold'
              : ''
          }`}
        >
          Device IMU
        </button>
        <button
          type="button"
          onClick={() => onNavigateSection('serial')}
          className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeSection === 'serial'
              ? 'text-sky-600 dark:text-sky-400 underline underline-offset-4 font-bold'
              : ''
          }`}
        >
          WebSerial USB
        </button>
        <button
          type="button"
          onClick={() => onNavigateSection('calibration')}
          className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeSection === 'calibration'
              ? 'text-sky-600 dark:text-sky-400 underline underline-offset-4 font-bold'
              : ''
          }`}
        >
          Zero Calibration
        </button>
      </nav>

      {/* Zone 3: Theme Toggle + Primary Action */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onToggleDarkMode}
          aria-label={darkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          title={darkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
        >
          {darkMode ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Light</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-slate-700" />
              <span className="hidden sm:inline">Dark</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenCodeModal}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 rounded-lg shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Code className="w-3.5 h-3.5 text-sky-400 dark:text-white" />
          <span>Hardware & Python Code</span>
        </button>
      </div>
    </header>
  );
};

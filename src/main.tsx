import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress generic cross-origin browser extension "Script error." noise that has no error object or stack
window.addEventListener(
  'error',
  (event) => {
    if (event.message === 'Script error.' && !event.filename && !event.error) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  },
  true
);

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center w-screen h-screen bg-slate-950 text-slate-100 p-6 text-center gap-3">
          <h1 className="text-lg font-bold">AeroSync Flight Deck Reset Required</h1>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg cursor-pointer"
          >
            Reload Flight Deck
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);

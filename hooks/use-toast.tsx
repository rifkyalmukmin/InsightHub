'use client';

import * as React from 'react';

type ToastMessage = {
  id: number;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
};

type ToastContextValue = {
  toast: (message: Omit<ToastMessage, 'id'>) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

function Toaster({ toasts }: { toasts: ToastMessage[] }) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-lg border px-4 py-3 shadow-lg text-sm animate-in slide-in-from-bottom-2 ${
            t.variant === 'destructive'
              ? 'border-destructive/50 bg-destructive text-destructive-foreground'
              : 'border-border bg-card text-card-foreground'
          }`}
        >
          <p className="font-medium">{t.title}</p>
          {t.description && (
            <p className="text-xs opacity-80 mt-0.5">{t.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const toast = React.useCallback((message: Omit<ToastMessage, 'id'>) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { ...message, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <Toaster toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

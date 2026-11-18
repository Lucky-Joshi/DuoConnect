import { Toaster as HotToaster } from 'react-hot-toast';

/** App-wide toasts styled from the same design tokens as the rest of the UI. */
export function Toaster() {
  return (
    <HotToaster
      position="top-center"
      gutter={10}
      containerStyle={{ top: 18 }}
      toastOptions={{
        duration: 3800,
        style: {
          background: 'var(--glass-bg-strong)',
          color: 'var(--text)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-lg)',
          backdropFilter: 'blur(18px) saturate(140%)',
          fontSize: 13.5,
          fontWeight: 500,
          lineHeight: 1.45,
          maxWidth: 440,
          padding: '10px 14px',
        },
        success: { iconTheme: { primary: 'var(--success)', secondary: 'var(--surface-solid)' } },
        error: { iconTheme: { primary: 'var(--danger)', secondary: 'var(--surface-solid)' } },
      }}
    />
  );
}

import React from 'react';

/**
 * Full-screen scaffold for the SSO flow — used by both SsoStartRoute and
 * SsoCallbackRoute. Deliberately light on styling: it should feel neutral
 * during the brief moment the user sees it, not like a branded stop.
 */

type Props = {
  title: string;
  message?: string;
  tone?: 'neutral' | 'error';
  children?: React.ReactNode;
};

const toneColor = (tone?: Props['tone']) =>
  tone === 'error' ? '#b91c1c' : '#374151';

export const SsoScreen: React.FC<Props> = ({ title, message, tone, children }) => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f9fafb',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: 24,
    }}
  >
    <div
      style={{
        maxWidth: 460,
        width: '100%',
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: '36px 40px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <h1 style={{ fontSize: 20, margin: '0 0 10px', color: '#1a1a2e' }}>{title}</h1>
      {message && (
        <p style={{ fontSize: 15, lineHeight: 1.55, margin: 0, color: toneColor(tone) }}>
          {message}
        </p>
      )}
      {children && <div style={{ marginTop: 20 }}>{children}</div>}
    </div>
  </div>
);


// This file manages application configuration and secrets.
// It abstracts the source of the configuration (Environment Variables vs Defaults).

// Helper to safely access environment variables in different environments (Vite, Create React App, or plain browser)
const getEnv = (key: string, viteKey: string, fallback: string): string => {
  // 1. Try Vite (modern bundler)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[viteKey]) {
    // @ts-ignore
    return import.meta.env[viteKey];
  }
  
  // 2. Try Standard Process (Node/CRA/Webpack)
  // @ts-ignore
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    // @ts-ignore
    return process.env[key];
  }

  // 3. Return Fallback (Mock/Demo Mode)
  return fallback;
};

export const CONFIG = {
  // Application Mode
  IS_DEMO_MODE: getEnv('REACT_APP_DEMO_MODE', 'VITE_DEMO_MODE', 'true') === 'true',
  
  // External API Endpoints (Real Integration)
  API_BASE_URL: getEnv('REACT_APP_API_URL', 'VITE_API_URL', 'https://api.entrepreneurship-nexus.org'),
  
  // Secrets (These should be set in your Deployment Platform like Vercel/Netlify, not committed)
  // These defaults are SAFE TO EXPOSE because they are just for the demo.
  INTEGRATION_API_KEY: getEnv('REACT_APP_INTEGRATION_KEY', 'VITE_INTEGRATION_KEY', 'mock_key_do_not_use_in_prod'),
  
  // Feature Flags
  FEATURES: {
    ENABLE_REAL_EMAILS: getEnv('REACT_APP_ENABLE_EMAILS', 'VITE_ENABLE_EMAILS', 'false') === 'true',
    SHOW_FIREBASE_PANEL: getEnv('REACT_APP_SHOW_FIREBASE_PANEL', 'VITE_SHOW_FIREBASE_PANEL', 'false') === 'true',
  }
};

// Helper to check if we are using real secrets
export const isUsingRealSecrets = () => {
  return CONFIG.INTEGRATION_API_KEY !== 'mock_key_do_not_use_in_prod';
};

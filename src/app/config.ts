
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
  // Application Mode. Fail-closed: an unset VITE_DEMO_MODE means demo mode is
  // OFF — a misconfigured production build must not ship with auth disabled
  // and every feature flag forced on. Demo builds opt in via .env(.example).
  IS_DEMO_MODE: getEnv('REACT_APP_DEMO_MODE', 'VITE_DEMO_MODE', 'false') === 'true',

  // Which surfaces a demo build exposes.
  //   'full'    — every feature flag on (the original exploratory demo)
  //   'compact' — only the interoperability core: referrals, directory,
  //               people, the entrepreneur portal, interactions, and the API
  //               console. Used for the consortium demo, where extra modules
  //               are a distraction from the compact itself.
  // Ignored unless IS_DEMO_MODE is true.
  DEMO_PROFILE: getEnv('REACT_APP_DEMO_PROFILE', 'VITE_DEMO_PROFILE', 'full') === 'compact'
    ? 'compact' as const
    : 'full' as const,


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

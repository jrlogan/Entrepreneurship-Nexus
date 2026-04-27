
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { AuthProvider } from './app/AuthProvider';
import { SsoStartRoute } from './features/sso/SsoStartRoute';
import { SsoCallbackRoute } from './features/sso/SsoCallbackRoute';

const pickRoute = () => {
  const { pathname } = window.location;

  // /sso/<providerId>           — federated PKCE sign-in.
  // /sso/<providerId>/link      — same flow, but the callback attaches the
  //                               provider identity to the already-signed-
  //                               in Nexus user instead of creating/
  //                               signing-in a new one.
  // Neither route is surfaced on the default login screen; they're reached
  // from partner-site buttons or from in-app "Connect" actions.
  const ssoStart = pathname.match(/^\/sso\/([^/?#]+?)(\/link)?\/?$/);
  if (ssoStart) {
    const providerId = decodeURIComponent(ssoStart[1]);
    const intent: 'link' | 'login' = ssoStart[2] === '/link' ? 'link' : 'login';
    return <SsoStartRoute providerId={providerId} intent={intent} />;
  }

  // /oauth/callback — where the provider redirects back after auth.
  // AuthProvider is deliberately NOT wrapped here: the callback mints a
  // Firebase custom token and signs in programmatically, then hands off
  // to "/" where AuthProvider + App run normally.
  if (pathname === '/oauth/callback' || pathname === '/oauth/callback/') {
    return <SsoCallbackRoute />;
  }

  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<React.StrictMode>{pickRoute()}</React.StrictMode>);

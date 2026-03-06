
import React, { createContext, useContext, ReactNode } from 'react';
import { AppRepos } from '../data/repos';
import { ViewerContext } from '../domain/access/policy';

interface AppContextValue {
  repos: AppRepos;
  viewer: ViewerContext;
}

const AppDataContext = createContext<AppContextValue | null>(null);

export const AppDataProvider = ({ repos, viewer, children }: { repos: AppRepos, viewer: ViewerContext, children: ReactNode }) => {
  return (
    <AppDataContext.Provider value={{ repos, viewer }}>
      {children}
    </AppDataContext.Provider>
  );
};

export const useRepos = (): AppRepos => {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useRepos must be used within an AppDataProvider');
  }
  return context.repos;
};

export const useViewer = (): ViewerContext => {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useViewer must be used within an AppDataProvider');
  }
  return context.viewer;
};

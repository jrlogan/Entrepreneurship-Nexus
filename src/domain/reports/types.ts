import { ReactNode } from 'react';
import { AppRepos } from '../../data/repos';
import { ViewerContext } from '../access/policy';

export interface ReportColumn<T> {
  header: string;
  render: (row: T) => ReactNode;
}

export interface ReportDefinition<T> {
  id: string;
  title: string;
  description: string;
  columns: ReportColumn<T>[];
  getData: (repos: AppRepos, viewer: ViewerContext) => T[];
}
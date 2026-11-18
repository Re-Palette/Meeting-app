import { createContext, useContext } from 'react';
import type { Settings } from '../../shared/types';

export interface AppCtx {
  settings: Settings | undefined;
  setSettings: (s: Settings) => void;
  tz: string;
  ownerName: string;
  pendingCount: number;
  refreshPending: () => void;
}

export const AppContext = createContext<AppCtx>({
  settings: undefined,
  setSettings: () => {},
  tz: 'Asia/Tokyo',
  ownerName: '',
  pendingCount: 0,
  refreshPending: () => {},
});

export const useApp = () => useContext(AppContext);

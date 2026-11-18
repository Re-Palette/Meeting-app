import { createContext, useContext } from 'react';
import type { CurrentUser, Settings } from '../../shared/types';

export interface AppCtx {
  settings: Settings | undefined;
  /** Signed-in user (owner or invited member); null until /api/auth/me answers. */
  user: CurrentUser | null;
  isOwner: boolean;
  setSettings: (s: Settings) => void;
  tz: string;
  ownerName: string;
  pendingCount: number;
  refreshPending: () => void;
}

export const AppContext = createContext<AppCtx>({
  settings: undefined,
  user: null,
  isOwner: false,
  setSettings: () => {},
  tz: 'Asia/Tokyo',
  ownerName: '',
  pendingCount: 0,
  refreshPending: () => {},
});

export const useApp = () => useContext(AppContext);

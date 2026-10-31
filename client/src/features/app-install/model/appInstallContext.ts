'use client';

import { createContext } from 'react';
import type { AppInstallContextValue } from './appInstallTypes';

export const AppInstallContext = createContext<AppInstallContextValue | null>(null);

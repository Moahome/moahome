export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

export interface AppInstallContextValue {
  available: boolean;
  installed: boolean;
  busy: boolean;
  install: () => Promise<void>;
}

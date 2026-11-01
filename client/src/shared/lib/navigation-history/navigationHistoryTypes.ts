export interface NavigationHistoryEntry {
  id: string;
  position: number;
}

export interface NavigationHistoryRecord {
  id: string;
  start: number;
  urls: string[];
}

export type NavigationHistoryReturn = {
  mode: 'previous';
} | {
  mode: 'destination';
  href: string;
  onReplace: (href: string) => void;
};

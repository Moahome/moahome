export interface NavigationHistoryEntry {
  id: string;
  position: number;
}

export interface NavigationHistoryRecord {
  id: string;
  start: number;
  urls: string[];
}

export interface NavigationHistoryReturn {
  href: string;
  onReplace: (href: string) => void;
}

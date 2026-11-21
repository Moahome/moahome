import type { Option } from '@/shared/lib/options';

export interface BankOption extends Option {
  iconSrc: string;
  searchKeywords: readonly string[];
}

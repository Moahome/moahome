import type { RegistrationResident } from './residentSetupTypes';
import type { AdministratorDraft } from './administratorTypes';
import type { AutomaticUnitRule } from './automaticUnitsTypes';
import type { RegistrationAccount } from './bankAccountTypes';
import type { BasicInfoDraft } from './basicInfoTypes';
import type { FeeItemDraft } from './feeItemsTypes';
import type { OpeningBalancesDraft } from './openingBalancesTypes';
import type {
  BuildingDraft,
  UnitDraft
} from './unitSetupTypes';

export type RegistrationStep = 'basic' | 'units' | 'residents' | 'account' | 'fees' | 'review';

export interface RegistrationDraft {
  basicInfo: BasicInfoDraft;
  administrator: AdministratorDraft;
  residents?: RegistrationResident[];
  buildings: BuildingDraft[];
  units: UnitDraft[];
  automaticUnitRule: AutomaticUnitRule;
  bankAccounts: RegistrationAccount[];
  feeItems: FeeItemDraft[];
  openingBalances: OpeningBalancesDraft;
  step: RegistrationStep;
  basicInfoValidated: boolean;
}

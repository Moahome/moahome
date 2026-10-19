import type { RegistrationRequest } from '../api/registrationApiTypes';

export interface PendingRegistration {
  requestId: string;
  request: RegistrationRequest | null;
}

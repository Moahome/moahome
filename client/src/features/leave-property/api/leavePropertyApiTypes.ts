export type LeaveReason = 'SERVICE_ONLY' | 'MOVE_OUT';

export interface LeavePropertyRequest {
  reason: LeaveReason;
}

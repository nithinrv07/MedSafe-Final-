export type PatientTab = 'LOCKER' | 'DOCTORS' | 'LEDGER' | 'KEYCARD' | 'NODEMAP';

export type UpdateRequestHandler = (requestId: string, status: 'APPROVED' | 'REJECTED' | 'REVOKED') => void;

export type AddLogHandler = (action: string, status: 'SUCCESS' | 'WARNING' | 'ALERT', details: string) => void;

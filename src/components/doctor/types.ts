export type DoctorTab = 'PATIENTS_SEARCH' | 'ACTIVE_GRANTS' | 'RECENT_LOGS';

/** patientId (optional) makes the entry visible to that patient as well. */
export type AddLogHandler = (action: string, status: 'SUCCESS' | 'WARNING' | 'ALERT', details: string, patientId?: string) => void;

export interface ScannedData {
  readable: boolean;
  name: string;
  designation: string;
  mobile: string;
  company: string;
  address: string;
  email: string;
  website: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
}

export interface ScanRecord {
  id: string;
  frontImage: string;
  backImage?: string;
  data: ScannedData;
  timestamp: string;
  createdAt?: number; // millisecond timestamp for date range filtering
}

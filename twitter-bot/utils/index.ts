export function logInfo(message: string) {
  console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
}

export function logError(message: string, error?: any) {
  console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
}

export interface Tweet {
  tweet_id: string;
  is_replied: boolean;
  resolution_time: number;
  question: string;
  blink_url: string;
  bet_id: string;
  created_at: Date;
  updated_at: Date;
}
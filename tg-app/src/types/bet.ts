export interface BetDetail {
  bettor: string;
  amount: number;
}

export interface Bet {
  id: number;
  description: string;
  end_time: number;
  resolved: boolean;
  outcome: boolean | null;
  total_yes: number;
  total_no: number;
  bets_yes: BetDetail[];
  bets_no: BetDetail[];
}
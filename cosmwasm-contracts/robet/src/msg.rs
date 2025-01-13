use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct InstantiateMsg {
    pub manager: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub enum ExecuteMsg {
    CreateBet {
        description: String,
        end_time: u64, // Unix timestamp
    },
    PlaceBet {
        bet_id: u64,
        outcome: bool, // true for yes, false for no
    },
    ResolveBet {
        bet_id: u64,
        outcome: bool,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub enum QueryMsg {
    GetBet { bet_id: u64 },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct BetInfo {
    pub id: u64,
    pub description: String,
    pub end_time: u64,
    pub resolved: bool,
    pub outcome: Option<bool>,
    pub total_yes: u128,
    pub total_no: u128,
    pub bets_yes: Vec<BetDetail>,
    pub bets_no: Vec<BetDetail>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct BetDetail {
    pub bettor: String,
    pub amount: u128,
}

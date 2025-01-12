use cosmwasm_std::Addr;
use cw_storage_plus::{Item, Map};
use serde::{Deserialize, Serialize};

use crate::msg::BetInfo;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Config {
    pub manager: Addr,
}

pub const CONFIG: Item<Config> = Item::new("config");
pub const BETS: Map<u64, BetInfo> = Map::new("bets");
pub const NEXT_BET_ID: Item<u64> = Item::new("next_bet_id");

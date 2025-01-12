use cosmwasm_std::{
    entry_point, to_json_binary, BankMsg, Binary, Coin, Deps, DepsMut, Env, MessageInfo, Response, StdError, StdResult
};

use crate::msg::{BetDetail, BetInfo, ExecuteMsg, InstantiateMsg, QueryMsg};
use crate::state::{CONFIG, BETS, NEXT_BET_ID};
use crate::state::Config;

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> StdResult<Response> {
    let config = Config {
        manager: deps.api.addr_validate(&msg.manager)?,
    };
    CONFIG.save(deps.storage, &config)?;
    NEXT_BET_ID.save(deps.storage, &0u64)?;
    Ok(Response::default())
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> StdResult<Response> {
    match msg {
        ExecuteMsg::CreateBet { description, end_time } => {
            execute_create_bet(deps, env, info, description, end_time)
        }
        ExecuteMsg::PlaceBet { bet_id, outcome } => {
            execute_place_bet(deps, env, info, bet_id, outcome)
        }
        ExecuteMsg::ResolveBet { bet_id, outcome } => {
            execute_resolve_bet(deps, env, info, bet_id, outcome)
        }
    }
}

pub fn execute_create_bet(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    description: String,
    end_time: u64,
) -> StdResult<Response> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.manager {
        return Err(StdError::generic_err("Only manager can create bets"));
    }

    let bet_id = NEXT_BET_ID.load(deps.storage)?;
    NEXT_BET_ID.save(deps.storage, &(bet_id + 1))?;

    let bet = BetInfo {
        id: bet_id,
        description,
        end_time,
        resolved: false,
        outcome: None,
        total_yes: 0,
        total_no: 0,
        bets_yes: vec![],
        bets_no: vec![],
    };

    BETS.save(deps.storage, bet_id, &bet)?;

    Ok(Response::new().add_attribute("action", "create_bet").add_attribute("bet_id", bet_id.to_string()))
}

pub fn execute_place_bet(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    bet_id: u64,
    outcome: bool,
) -> StdResult<Response> {
    let mut bet = BETS.load(deps.storage, bet_id)?;
    if bet.resolved {
        return Err(StdError::generic_err("Bet already resolved"));
    }
    if env.block.time.seconds() > bet.end_time {
        return Err(StdError::generic_err("Bet period has ended"));
    }
    if info.funds.is_empty() {
        return Err(StdError::generic_err("No funds sent"));
    }
    let amount = info.funds.iter().find(|c| c.denom == "uxion").ok_or(StdError::generic_err("Must send uxion"))?.amount.u128();

    if outcome {
        bet.total_yes += amount;
        bet.bets_yes.push(BetDetail {
            bettor: info.sender.to_string(),
            amount,
        });
    } else {
        bet.total_no += amount;
        bet.bets_no.push(BetDetail {
            bettor: info.sender.to_string(),
            amount,
        });
    }

    BETS.save(deps.storage, bet_id, &bet)?;

    Ok(Response::new().add_attribute("action", "place_bet").add_attribute("bet_id", bet_id.to_string()))
}

pub fn execute_resolve_bet(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    bet_id: u64,
    outcome: bool,
) -> StdResult<Response> {
    let config = CONFIG.load(deps.storage)?;
    if info.sender != config.manager {
        return Err(StdError::generic_err("Only manager can resolve bets"));
    }

    let mut bet = BETS.load(deps.storage, bet_id)?;
    if bet.resolved {
        return Err(StdError::generic_err("Bet already resolved"));
    }
    if env.block.time.seconds() < bet.end_time {
        return Err(StdError::generic_err("Bet period not ended yet"));
    }

    bet.resolved = true;
    bet.outcome = Some(outcome);

    // Distribute funds
    let total_yes = bet.total_yes;
    let total_no = bet.total_no;
    let total_pool = total_yes + total_no;

    let mut messages: Vec<cosmwasm_std::CosmosMsg> = vec![];

    if outcome {
        // Yes wins, distribute total_pool to yes bettors proportionally
        for bet_detail in bet.bets_yes.iter() {
            let payout = (bet_detail.amount as u128 * total_pool) / total_yes;
            messages.push(BankMsg::Send {
                to_address: bet_detail.bettor.clone(),
                amount: vec![Coin {
                    denom: "uxion".to_string(),
                    amount: payout.into(),
                }],
            }
            .into());
        }
    } else {
        // No wins, distribute total_pool to no bettors proportionally
        for bet_detail in bet.bets_no.iter() {
            let payout = (bet_detail.amount as u128 * total_pool) / total_no;
            messages.push(BankMsg::Send {
                to_address: bet_detail.bettor.clone(),
                amount: vec![Coin {
                    denom: "uxion".to_string(),
                    amount: payout.into(),
                }],
            }
            .into());
        }
    }

    BETS.save(deps.storage, bet_id, &bet)?;

    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("action", "resolve_bet")
        .add_attribute("bet_id", bet_id.to_string())
        .add_attribute("outcome", outcome.to_string()))
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetBet { bet_id } => to_json_binary(&query_bet(deps, bet_id)?),
    }
}

fn query_bet(deps: Deps, bet_id: u64) -> StdResult<BetInfo> {
    let bet = BETS.load(deps.storage, bet_id)?;
    Ok(bet)
}

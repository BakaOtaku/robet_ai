use cosmwasm_std::{
    entry_point, to_json_binary, Addr, Binary, CosmosMsg, Deps, DepsMut, Env, MessageInfo, Response,
    StdError, StdResult, Uint128, WasmMsg, Event,
};
use cw2::set_contract_version;
use cw_storage_plus::Item;
use cosmwasm_schema::{cw_serde, QueryResponses};

// Version info for migration
const CONTRACT_NAME: &str = "crates.io:robet-cosmwasm";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// State storage for the contract configuration.
#[cw_serde]
pub struct Config {
    /// The owner who can manage the whitelist.
    pub owner: Addr,
    /// The wallet that receives deposited tokens.
    pub admin_wallet: Addr,
    /// List of whitelisted token contract addresses.
    pub whitelist: Vec<Addr>,
}

// Use a singleton storage item for config.
const CONFIG: Item<Config> = Item::new("config");

/// Instantiate message. The instantiator's address will be saved as the owner.
#[cw_serde]
pub struct InstantiateMsg {
    /// The admin wallet address that will receive deposited tokens.
    pub admin_wallet: String,
}

/// Execute messages.
#[cw_serde]
pub enum ExecuteMsg {
    /// Adds a token contract to the whitelist. (Owner only)
    AddWhitelistedToken {
        token_address: String,
    },
    /// Removes a token contract from the whitelist. (Owner only)
    RemoveWhitelistedToken {
        token_address: String,
    },
    /// Deposits tokens from the user to the admin wallet.
    ///
    /// Note: This uses a CW20 `TransferFrom` call; the user must have granted this contract an allowance.
    DepositToken {
        token_address: String,
        amount: Uint128,
    },
    /// Updates the config (for example, changing the admin wallet). (Owner only)
    UpdateConfig {
        new_admin_wallet: String,
    },
}

/// Query messages.
#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    /// Returns the current configuration.
    #[returns(Config)]
    GetConfig {},
}

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> StdResult<Response> {
    let admin_wallet = deps.api.addr_validate(&msg.admin_wallet)?;
    let config = Config {
        owner: info.sender.clone(),
        admin_wallet,
        whitelist: vec![],
    };
    CONFIG.save(deps.storage, &config)?;
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    Ok(Response::default()
        .add_event(Event::new("instantiate")
            .add_attribute("owner", info.sender)
            .add_attribute("admin_wallet", msg.admin_wallet)))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> StdResult<Response> {
    match msg {
        ExecuteMsg::AddWhitelistedToken { token_address } => {
            execute_add_whitelisted_token(deps, info, token_address)
        }
        ExecuteMsg::RemoveWhitelistedToken { token_address } => {
            execute_remove_whitelisted_token(deps, info, token_address)
        }
        ExecuteMsg::DepositToken {
            token_address,
            amount,
        } => execute_deposit_token(deps, env, info, token_address, amount.into()),
        ExecuteMsg::UpdateConfig { new_admin_wallet } => {
            execute_update_config(deps, info, new_admin_wallet)
        }
    }
}

/// Allows the owner to add a token address to the whitelist.
pub fn execute_add_whitelisted_token(
    deps: DepsMut,
    info: MessageInfo,
    token_address: String,
) -> StdResult<Response> {
    CONFIG.update(deps.storage, |mut config| -> StdResult<_> {
        // Only the owner can update the whitelist.
        if config.owner != info.sender {
            return Err(StdError::generic_err("Unauthorized"));
        }
        let token_addr = deps.api.addr_validate(&token_address)?;
        if !config.whitelist.contains(&token_addr) {    
            config.whitelist.push(token_addr.clone());
        }
        Ok(config)
    })?;
    Ok(Response::new()
        .add_event(Event::new("add_whitelisted_token")
            .add_attribute("token_address", token_address)))
}

/// Allows the owner to remove a token address from the whitelist.
pub fn execute_remove_whitelisted_token(
    deps: DepsMut,
    info: MessageInfo,
    token_address: String,
) -> StdResult<Response> {
    CONFIG.update(deps.storage, |mut config| -> StdResult<_> {
        if config.owner != info.sender {
            return Err(StdError::generic_err("Unauthorized"));
        }
        let token_addr = deps.api.addr_validate(&token_address)?;
        config.whitelist.retain(|addr| *addr != token_addr);
        Ok(config)
    })?;
    Ok(Response::new()
        .add_event(Event::new("remove_whitelisted_token")
            .add_attribute("token_address", token_address)))
}

/// Allows the owner to update the admin wallet.
pub fn execute_update_config(
    deps: DepsMut,
    info: MessageInfo,
    new_admin_wallet: String,
) -> StdResult<Response> {
    let mut config = CONFIG.load(deps.storage)?;
    if config.owner != info.sender {
        return Err(StdError::generic_err("Unauthorized"));
    }
    
    let old_admin = config.admin_wallet.to_string();
    config.admin_wallet = deps.api.addr_validate(&new_admin_wallet)?;
    CONFIG.save(deps.storage, &config)?;
    
    Ok(Response::new()
        .add_event(Event::new("update_config")
            .add_attribute("old_admin_wallet", old_admin)
            .add_attribute("new_admin_wallet", new_admin_wallet)))
}

/// Deposits tokens from the user into the admin wallet's account.
///
/// This function checks that the token is whitelisted and then constructs a CW20
/// `TransferFrom` message. (The user must have approved an allowance for this contract.)
pub fn execute_deposit_token(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    token_address: String,
    amount: Uint128,
) -> StdResult<Response> {
    // Load the stored config.
    let config = CONFIG.load(deps.storage)?;
    let token_addr = deps.api.addr_validate(&token_address)?;
    // Check if the token is whitelisted.
    if !config.whitelist.contains(&token_addr) {
        return Err(StdError::generic_err("Token not whitelisted"));
    }

    // Construct the CW20 TransferFrom message.
    // Note: This requires that the user has given this contract sufficient allowance.
    let transfer_from_msg = cw20_base::msg::ExecuteMsg::TransferFrom {
        owner: info.sender.to_string(),
        recipient: config.admin_wallet.to_string(),
        amount,
    };
    let exec_transfer = WasmMsg::Execute {
        contract_addr: token_addr.to_string(),
        msg: to_json_binary(&transfer_from_msg)?,
        funds: vec![],
    };

    // Create string values before using them in the vector
    let sender_string = info.sender.to_string();
    let amount_string = amount.to_string();
    let timestamp_string = env.block.time.seconds().to_string();
    
    Ok(Response::new()
        .add_message(CosmosMsg::Wasm(exec_transfer))
        .add_event(Event::new("deposit_token")
            .add_attribute("user", sender_string)
            .add_attribute("amount", amount_string)
            .add_attribute("token_address", token_address)
            .add_attribute("timestamp", timestamp_string)))
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetConfig {} => to_json_binary(&CONFIG.load(deps.storage)?),
    }
}

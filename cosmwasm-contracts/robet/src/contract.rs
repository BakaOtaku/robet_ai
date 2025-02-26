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
    /// For CW20 tokens: Provide token_address (contract address) and amount (requires allowance).
    /// For native tokens: Provide token_address (denom string) and amount, and send with the transaction.
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
        } => execute_deposit_token(deps, env, info, token_address, amount),
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
/// This function handles both CW20 tokens and native tokens:
/// - For CW20 tokens: Provide token_address (contract address) and amount (requires allowance)
/// - For native tokens: Provide token_address (denom string) and amount, with matching funds sent
pub fn execute_deposit_token(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    token_address: String,
    amount: Uint128,
) -> StdResult<Response> {
    // Load the stored config.
    let config = CONFIG.load(deps.storage)?;
    
    // Check if the token_address is a denom (starts with a specific pattern like "u")
    // This is a simple heuristic - adjust based on your chain's denom patterns
    if token_address.starts_with("u") || token_address.contains("ibc/") {
        // Handle native tokens
        
        // Find the specified denom in the sent funds
        let sent_amount = info
            .funds
            .iter()
            .find(|coin| coin.denom == token_address)
            .map(|coin| coin.amount)
            .unwrap_or(Uint128::zero());
        
        // Verify the sent amount matches the specified amount
        if sent_amount != amount {
            return Err(StdError::generic_err(format!(
                "Sent amount ({}) doesn't match specified amount ({}) for denom {}",
                sent_amount, amount, token_address
            )));
        }
        
        if sent_amount.is_zero() {
            return Err(StdError::generic_err(format!(
                "No tokens with denom {} were sent with transaction", 
                token_address
            )));
        }
        
        // Create a bank send message for just this denom
        let bank_msg = CosmosMsg::Bank(cosmwasm_std::BankMsg::Send {
            to_address: config.admin_wallet.to_string(),
            amount: vec![cosmwasm_std::Coin {
                denom: token_address.clone(),
                amount,
            }],
        });
        
        // Create response with the bank send message and event
        Ok(Response::new()
            .add_message(bank_msg)
            .add_event(Event::new("deposit_token")
                .add_attribute("user", info.sender.to_string())
                .add_attribute("amount", amount.to_string())
                .add_attribute("token_address", token_address)
                .add_attribute("token_type", "native")
                .add_attribute("timestamp", env.block.time.seconds().to_string())))
    } else {
        // Handle CW20 tokens
        let token_addr = deps.api.addr_validate(&token_address)?;
        
        // Check if the token is whitelisted.
        if !config.whitelist.contains(&token_addr) {
            return Err(StdError::generic_err("Token not whitelisted"));
        }

        // Construct the CW20 TransferFrom message.
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
        
        Ok(Response::new()
            .add_message(CosmosMsg::Wasm(exec_transfer))
            .add_event(Event::new("deposit_token")
                .add_attribute("user", info.sender.to_string())
                .add_attribute("amount", amount.to_string())
                .add_attribute("token_address", token_addr.to_string())
                .add_attribute("token_type", "cw20")
                .add_attribute("timestamp", env.block.time.seconds().to_string())))
    }
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetConfig {} => to_json_binary(&CONFIG.load(deps.storage)?),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{coins, from_binary, Addr, BankMsg, SubMsg};

    #[test]
    fn test_native_token_detection() {
        println!("testing native token detection with uxion");
        let mut deps = mock_dependencies();
        let env = mock_env();
        
        // Set up contract config
        let config = Config {
            owner: Addr::unchecked("owner"),
            admin_wallet: Addr::unchecked("admin_wallet"),
            whitelist: vec![],
        };
        CONFIG.save(deps.as_mut().storage, &config).unwrap();
        
        // Test "uxion" as token_address
        let amount = Uint128::new(1000);
        let info = mock_info("sender", &coins(1000, "uxion"));
        
        let result = execute_deposit_token(
            deps.as_mut(),
            env.clone(),
            info,
            "uxion".to_string(),
            amount,
        ).unwrap();
        
        // Verify it was treated as a native token by checking for a bank message
        assert_eq!(result.messages.len(), 1);
        match &result.messages[0].msg {
            CosmosMsg::Bank(BankMsg::Send { to_address, amount: send_amount }) => {
                assert_eq!(to_address, "admin_wallet");
                assert_eq!(send_amount.len(), 1);
                assert_eq!(send_amount[0].denom, "uxion");
                assert_eq!(send_amount[0].amount, amount);
            },
            _ => panic!("Expected Bank message, got something else"),
        }
        
        // Check event attributes that indicate it was treated as native
        let deposit_event = result.events.iter().find(|e| e.ty == "deposit_token").unwrap();
        let token_type = deposit_event.attributes.iter()
            .find(|attr| attr.key == "token_type")
            .unwrap();
        assert_eq!(token_type.value, "native");
    }
}

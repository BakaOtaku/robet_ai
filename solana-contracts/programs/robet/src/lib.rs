use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    TokenAccount, Mint, TokenInterface, transfer_checked
};

declare_id!("Bm6LM1dhfnVDCSah6h8tMayYA5yRKT29KUMuMRScQ5ee");

#[program]
pub mod robet {
    use anchor_spl::token_2022::TransferChecked;

    use super::*;

    /// Initializes the config account with the admin wallet and an empty whitelist.
    pub fn initialize_config(ctx: Context<InitializeConfig>, admin_wallet: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.owner = ctx.accounts.owner.key();
        config.admin_wallet = admin_wallet;
        config.whitelist = Vec::new();
        Ok(())
    }

    /// Adds a token mint to the whitelist. Only callable by the owner.
    pub fn add_whitelisted_token(ctx: Context<ManageWhitelist>, token_mint: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        if !config.whitelist.contains(&token_mint) {
            config.whitelist.push(token_mint);
        }
        Ok(())
    }

    /// Removes a token mint from the whitelist. Only callable by the owner.
    pub fn remove_whitelisted_token(ctx: Context<ManageWhitelist>, token_mint: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.whitelist.retain(|&x| x != token_mint);
        Ok(())
    }

    /// Deposits tokens from a user into the admin wallet’s associated token account.
    /// Only tokens that are whitelisted in the config can be deposited.
    pub fn deposit_token(ctx: Context<DepositToken>, amount: u64) -> Result<()> {
        // Ensure that the token mint is whitelisted.
        require!(
            ctx.accounts.config.whitelist.contains(&ctx.accounts.token_mint.key()),
            CustomError::TokenNotWhitelisted
        );

        // Transfer tokens from the user's token account to the admin's derived associated token account.
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.admin_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
        };
        let cpi_ctx =
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        transfer_checked(cpi_ctx, amount, ctx.accounts.token_mint.decimals)?;

        // Emit an event indicating a successful deposit.
        let clock = Clock::get()?;
        emit!(DepositEvent {
            config_owner: ctx.accounts.config.owner,
            user: ctx.accounts.user.key(),
            amount,
            token_mint: ctx.accounts.token_mint.key(),
            timestamp: clock.unix_timestamp as u64,
        });
        Ok(())
    }
    
    /// Allows the owner to update his configuration.
    /// In this example, the owner can update the admin wallet.
    pub fn update_config(ctx: Context<UpdateConfig>, new_admin_wallet: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin_wallet = new_admin_wallet;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    /// The config account to be initialized.
    #[account(init, payer = owner, space = 8 + Config::LEN)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageWhitelist<'info> {
    /// The config account; the owner must match the one stored in config.
    #[account(mut, has_one = owner)]
    pub config: Account<'info, Config>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct DepositToken<'info> {
    /// The user depositing tokens.
    #[account(mut)]
    pub user: Signer<'info>,

    /// The config account containing the admin wallet and whitelist.
    #[account(mut)]
    pub config: Account<'info, Config>,

    /// The token mint for the token being deposited.
    pub token_mint: InterfaceAccount<'info, Mint>,

    /// The depositor's token account for the given mint.
    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == token_mint.key()
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    /// The admin wallet's associated token account for the given mint.
    /// This account is derived automatically using the admin_wallet from the config.
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = config.admin_wallet,
    )]
    pub admin_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    /// The config account; the owner must match the one stored in config.
    #[account(mut, has_one = owner)]
    pub config: Account<'info, Config>,
    pub owner: Signer<'info>,
}

#[account]
pub struct Config {
    /// The owner who can manage the whitelist.
    pub owner: Pubkey,
    /// The wallet that receives deposited tokens.
    pub admin_wallet: Pubkey,
    /// List of whitelisted token mints.
    pub whitelist: Vec<Pubkey>,
}

impl Config {
    // Space calculation: 32 bytes for owner + 32 bytes for admin_wallet + 4 bytes for vector length + (max 10 * 32 bytes)
    pub const LEN: usize = 32 + 32 + 4 + 10 * 32;
}

#[event]
pub struct DepositEvent {
    pub config_owner: Pubkey, // Make sure to keep a check for config in the indexer
    pub user: Pubkey,
    pub amount: u64,
    pub token_mint: Pubkey,
    pub timestamp: u64,
}

#[error_code]
pub enum CustomError {
    #[msg("The token provided is not whitelisted for deposit.")]
    TokenNotWhitelisted,
}

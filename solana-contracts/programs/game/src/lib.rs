use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("8iMWoGnfjJHCGoYiVF176cQm1SkZVrX2V39RavfED8eX");

#[program]
pub mod game {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    pub fn create_bid(ctx: Context<CreateBid>, bid_id: String, bid_content: String) -> Result<()> {
        let bid = &mut ctx.accounts.bid;
        let creator = &ctx.accounts.creator;
        let clock = Clock::get()?;

        bid.id = bid_id;
        bid.content = bid_content;
        bid.creator = creator.key();
        bid.created_at = clock.unix_timestamp;
        bid.yes_votes = 0;
        bid.no_votes = 0;
        bid.status = BidStatus::Open;
        bid.outcome = false;

        Ok(())
    }

    pub fn place_bid(ctx: Context<PlaceBid>, bid_id: String, vote: bool) -> Result<()> {
        let bid = &mut ctx.accounts.bid;
        let user_bid = &mut ctx.accounts.user_bid;
        let bidder = &ctx.accounts.bidder;

        require!(bid.status == BidStatus::Open, BidError::BidClosed);

        // Transfer 0.01 SOL from bidder to bid account
        let deposit_amount = 10_000_000; // 0.01 SOL in lamports
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: bidder.to_account_info(),
                to: bid.to_account_info(),
            },
        );
        system_program::transfer(cpi_context, deposit_amount)?;

        user_bid.user = bidder.key();
        user_bid.bid_id = bid_id;
        user_bid.vote = vote;

        if vote {
            bid.yes_votes += 1;
        } else {
            bid.no_votes += 1;
        }

        Ok(())
    }

    pub fn resolve_bid(ctx: Context<ResolveBid>, _bid_id: String, outcome: bool) -> Result<()> {
        let bid = &mut ctx.accounts.bid;
        require!(bid.status == BidStatus::Open, BidError::BidClosed);

        bid.status = BidStatus::Resolved;
        bid.outcome = outcome;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bid_id: String)]
pub struct CreateBid<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + 32 + 32 + 8 + 256 + 8 + 8 + 1 + 1,
        seeds = [b"bid", bid_id.as_bytes()],
        bump
    )]
    pub bid: Account<'info, Bid>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bid_id: String)]
pub struct PlaceBid<'info> {
    #[account(mut, seeds = [b"bid", bid_id.as_bytes()], bump)]
    pub bid: Account<'info, Bid>,
    #[account(
        init,
        payer = bidder,
        space = 8 + 32 + 256 + 1,
        seeds = [b"user_bid", bidder.key().as_ref(), bid_id.as_bytes()],
        bump
    )]
    pub user_bid: Account<'info, UserBid>,
    #[account(mut)]
    pub bidder: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bid_id: String)]
pub struct ResolveBid<'info> {
    #[account(
        mut,
        seeds = [b"bid", bid_id.as_bytes()],
        bump,
        constraint = bid.id == bid_id @ BidError::InvalidBid
    )]
    pub bid: Account<'info, Bid>,
    pub resolver: Signer<'info>,
}

#[account]
pub struct Bid {
    pub id: String,
    pub creator: Pubkey,
    pub created_at: i64,
    pub content: String,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub status: BidStatus,
    pub outcome: bool,
}

#[account]
pub struct UserBid {
    pub user: Pubkey,
    pub bid_id: String,
    pub vote: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum BidStatus {
    Open,
    Resolved,
}

#[error_code]
pub enum BidError {
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Bid is closed")]
    BidClosed,
    #[msg("Invalid bid ID")]
    InvalidBid,
}

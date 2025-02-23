// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ERC20Escrow is Ownable {
    using SafeERC20 for IERC20;
    mapping(address => mapping(address => uint256)) public userBalances;
    mapping(address => bool) public supportedTokens;

    event TokenAdded(address indexed token);
    event Deposited(
        address indexed user,
        address indexed token,
        uint256 amount
    );
    event Withdrawn(
        address indexed token,
        uint256 amount,
        address indexed recipient
    );
    // Track the last deposit sender for direct transfers
    address public lastDepositSender;

    constructor() {
        _transferOwnership(msg.sender);
    }

    // Add supported token (admin only)
    function addToken(address _token) external onlyOwner {
        supportedTokens[_token] = true;
        emit TokenAdded(_token);
    }

    // Function to receive direct transfers
    function notifyDeposit(address _token) external {
        require(supportedTokens[_token], "Token not supported");

        // Get the actual transferred amount
        uint256 newBalance = IERC20(_token).balanceOf(address(this));
        uint256 previousBalance = getTotalUserBalances(_token);
        uint256 depositAmount = newBalance - previousBalance;

        require(depositAmount > 0, "No new deposit detected");

        // Credit the sender
        userBalances[msg.sender][_token] += depositAmount;
        emit Deposited(msg.sender, _token, depositAmount);
    }

    // Original deposit function (requires approval)
    function deposit(address _token, uint256 _amount) external {
        require(supportedTokens[_token], "Token not supported");

        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        userBalances[msg.sender][_token] += _amount;

        emit Deposited(msg.sender, _token, _amount);
    }

    // Helper function to get total user balances for a token
    function getTotalUserBalances(
        address _token
    ) public view returns (uint256) {
        return IERC20(_token).balanceOf(address(this));
    }

    // Get user balance
    function getUserBalance(
        address user,
        address token
    ) external view returns (uint256) {
        return userBalances[user][token];
    }

    // Withdraw funds from contract (admin only)
    function adminWithdraw(
        address _token,
        uint256 _amount,
        address _recipient
    ) public onlyOwner {
        require(supportedTokens[_token], "Token not supported");
        require(
            IERC20(_token).balanceOf(address(this)) >= _amount,
            "Insufficient contract balance"
        );

        IERC20(_token).safeTransfer(_recipient, _amount);
        emit Withdrawn(_token, _amount, _recipient);
    }

    // Withdraw entire contract balance of a token (admin only)
    function adminWithdrawAll(
        address _token,
        address _recipient
    ) external onlyOwner {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        adminWithdraw(_token, balance, _recipient);
    }
}

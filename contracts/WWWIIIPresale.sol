// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title WWWIIIPresale — Token Sale Contract
 * @notice Accepts ETH and distributes $WWWIII tokens at a fixed rate.
 *         Three tiers: Supporter (0.05 ETH), Builder (0.25 ETH), Architect (1.0 ETH).
 *         Owner can open/close the sale and withdraw raised ETH.
 */
contract WWWIIIPresale is Ownable, ReentrancyGuard {

    IERC20 public immutable token;

    // Rate: tokens per 1 ETH (in wei-to-wei ratio)
    // Supporter:  0.05 ETH = 50,000 tokens  → 1,000,000 tokens per ETH
    // Builder:    0.25 ETH = 300,000 tokens  → 1,200,000 tokens per ETH
    // Architect:  1.0  ETH = 1,500,000 tokens → 1,500,000 tokens per ETH
    uint256 public constant RATE_SUPPORTER  = 1_000_000;
    uint256 public constant RATE_BUILDER    = 1_200_000;
    uint256 public constant RATE_ARCHITECT  = 1_500_000;

    // Tier ETH thresholds (in wei)
    uint256 public constant TIER_SUPPORTER  = 0.05 ether;
    uint256 public constant TIER_BUILDER    = 0.25 ether;
    uint256 public constant TIER_ARCHITECT  = 1.0 ether;

    bool public saleActive;
    uint256 public totalRaised;
    uint256 public totalTokensSold;

    // Per-address tracking
    mapping(address => uint256) public contributed;
    mapping(address => uint256) public tokensBought;

    event TokensPurchased(address indexed buyer, uint256 ethAmount, uint256 tokenAmount, string tier);
    event SaleToggled(bool active);
    event ETHWithdrawn(address indexed to, uint256 amount);

    constructor(address _token) Ownable(msg.sender) {
        require(_token != address(0), "Zero token address");
        token = IERC20(_token);
    }

    /**
     * @notice Buy tokens at the Supporter tier (0.05 ETH each)
     */
    function buySupporter() external payable nonReentrant {
        require(saleActive, "Sale not active");
        require(msg.value >= TIER_SUPPORTER, "Min 0.05 ETH");
        _buyTokens(msg.sender, msg.value, RATE_SUPPORTER, "Supporter");
    }

    /**
     * @notice Buy tokens at the Builder tier (0.25 ETH each)
     */
    function buyBuilder() external payable nonReentrant {
        require(saleActive, "Sale not active");
        require(msg.value >= TIER_BUILDER, "Min 0.25 ETH");
        _buyTokens(msg.sender, msg.value, RATE_BUILDER, "Builder");
    }

    /**
     * @notice Buy tokens at the Architect tier (1.0 ETH each)
     */
    function buyArchitect() external payable nonReentrant {
        require(saleActive, "Sale not active");
        require(msg.value >= TIER_ARCHITECT, "Min 1.0 ETH");
        _buyTokens(msg.sender, msg.value, RATE_ARCHITECT, "Architect");
    }

    /**
     * @notice Generic buy — automatically picks the best tier based on ETH sent
     */
    receive() external payable {
        require(saleActive, "Sale not active");
        uint256 rate;
        string memory tier;
        if (msg.value >= TIER_ARCHITECT) {
            rate = RATE_ARCHITECT;
            tier = "Architect";
        } else if (msg.value >= TIER_BUILDER) {
            rate = RATE_BUILDER;
            tier = "Builder";
        } else if (msg.value >= TIER_SUPPORTER) {
            rate = RATE_SUPPORTER;
            tier = "Supporter";
        } else {
            revert("Min 0.05 ETH");
        }
        _buyTokens(msg.sender, msg.value, rate, tier);
    }

    function _buyTokens(address buyer, uint256 ethAmount, uint256 rate, string memory tier) internal {
        uint256 tokenAmount = ethAmount * rate * 10**18 / 1 ether;

        require(token.balanceOf(address(this)) >= tokenAmount, "Insufficient tokens in presale");

        totalRaised += ethAmount;
        totalTokensSold += tokenAmount;
        contributed[buyer] += ethAmount;
        tokensBought[buyer] += tokenAmount;

        token.transfer(buyer, tokenAmount);

        emit TokensPurchased(buyer, ethAmount, tokenAmount, tier);
    }

    // ── Owner functions ──

    function toggleSale() external onlyOwner {
        saleActive = !saleActive;
        emit SaleToggled(saleActive);
    }

    function withdrawETH(address payable to) external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "No ETH to withdraw");
        (bool ok,) = to.call{value: bal}("");
        require(ok, "Transfer failed");
        emit ETHWithdrawn(to, bal);
    }

    /**
     * @notice Withdraw unsold tokens after sale ends
     */
    function withdrawUnsoldTokens(address to) external onlyOwner {
        require(!saleActive, "Sale still active");
        uint256 remaining = token.balanceOf(address(this));
        require(remaining > 0, "No tokens remaining");
        token.transfer(to, remaining);
    }

    /**
     * @notice View tokens remaining in presale
     */
    function tokensRemaining() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title WWWIII — The People's AI Token
 * @author wwwiii.ai
 * @notice ERC-20 token funding the first publicly developed large language model.
 *         Fixed supply of 1 billion tokens. No mint function after deployment.
 *
 * Allocation:
 *   40% — Development Fund (compute, training, infrastructure, researcher grants)
 *   30% — Community (airdrops, contributor rewards, governance participation)
 *   15% — Team & Advisors (2-year vesting, 6-month cliff)
 *   10% — Liquidity (DEX pools, market making)
 *    5% — Reserve (emergency fund, partnerships)
 */
contract WWWIII is ERC20, Ownable {

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10**18;

    // Allocation addresses — set at deployment, immutable thereafter
    address public immutable devFund;
    address public immutable community;
    address public immutable team;
    address public immutable liquidity;
    address public immutable reserve;

    // Team vesting
    uint256 public immutable vestingStart;
    uint256 public constant CLIFF_DURATION = 180 days;
    uint256 public constant VESTING_DURATION = 730 days; // 2 years
    uint256 public teamReleased;

    constructor(
        address _devFund,
        address _community,
        address _team,
        address _liquidity,
        address _reserve
    ) ERC20("WWWIII", "WWWIII") Ownable(msg.sender) {
        require(_devFund != address(0), "Zero address: devFund");
        require(_community != address(0), "Zero address: community");
        require(_team != address(0), "Zero address: team");
        require(_liquidity != address(0), "Zero address: liquidity");
        require(_reserve != address(0), "Zero address: reserve");

        devFund   = _devFund;
        community = _community;
        team      = _team;
        liquidity = _liquidity;
        reserve   = _reserve;

        vestingStart = block.timestamp;

        // Mint allocations
        _mint(devFund,      TOTAL_SUPPLY * 40 / 100);  // 400M
        _mint(community,    TOTAL_SUPPLY * 30 / 100);  // 300M
        _mint(address(this), TOTAL_SUPPLY * 15 / 100); // 150M — held in contract for vesting
        _mint(liquidity,    TOTAL_SUPPLY * 10 / 100);  // 100M
        _mint(reserve,      TOTAL_SUPPLY *  5 / 100);  //  50M
    }

    /**
     * @notice Release vested team tokens. Anyone can call this.
     * @dev Linear vesting over 2 years with 6-month cliff.
     *      Tokens are held in this contract and released to the team address.
     */
    function releaseTeamTokens() external {
        uint256 elapsed = block.timestamp - vestingStart;
        require(elapsed >= CLIFF_DURATION, "Cliff not reached");

        uint256 totalVested;
        if (elapsed >= VESTING_DURATION) {
            totalVested = TOTAL_SUPPLY * 15 / 100;
        } else {
            totalVested = (TOTAL_SUPPLY * 15 / 100) * elapsed / VESTING_DURATION;
        }

        uint256 releasable = totalVested - teamReleased;
        require(releasable > 0, "Nothing to release");

        teamReleased += releasable;
        _transfer(address(this), team, releasable);
    }

    /**
     * @notice View how many team tokens are currently releasable.
     */
    function releasableTeamTokens() external view returns (uint256) {
        uint256 elapsed = block.timestamp - vestingStart;
        if (elapsed < CLIFF_DURATION) return 0;

        uint256 totalVested;
        if (elapsed >= VESTING_DURATION) {
            totalVested = TOTAL_SUPPLY * 15 / 100;
        } else {
            totalVested = (TOTAL_SUPPLY * 15 / 100) * elapsed / VESTING_DURATION;
        }

        return totalVested - teamReleased;
    }

    /**
     * @notice Burn tokens — deflationary mechanism. Any holder can burn their own tokens.
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}

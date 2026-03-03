// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/**
 * @title WWWIII Membership NFT
 * @notice On-chain SVG membership badges for WWWIII supporters
 * @dev ERC-721 with four tiers: Supporter, Builder, Architect, Genesis
 */
contract WWWIIINFT is ERC721, Ownable {
    using Strings for uint256;

    enum Tier { Supporter, Builder, Architect, Genesis }

    struct Badge {
        Tier tier;
        uint256 mintedAt;
        bool soulbound; // Genesis badges are non-transferable
    }

    uint256 public nextTokenId;
    string public baseMetadataURI;

    mapping(uint256 => Badge) public badges;
    mapping(Tier => uint256) public tierPrices;
    mapping(Tier => string) public tierColors;
    mapping(Tier => string) public tierNames;

    // Limits
    uint256 public constant MAX_GENESIS = 100;
    uint256 public genesisCount;

    event BadgeMinted(address indexed to, uint256 indexed tokenId, Tier tier);

    constructor() ERC721("WWWIII Membership", "WWWIII-NFT") Ownable(msg.sender) {
        // Tier prices in wei
        tierPrices[Tier.Supporter] = 0.05 ether;
        tierPrices[Tier.Builder] = 0.25 ether;
        tierPrices[Tier.Architect] = 1.0 ether;
        tierPrices[Tier.Genesis] = 0; // Invite only

        // Colors for on-chain SVG
        tierColors[Tier.Supporter] = "#6c5ce7";
        tierColors[Tier.Builder] = "#a29bfe";
        tierColors[Tier.Architect] = "#f0c040";
        tierColors[Tier.Genesis] = "#ff3838";

        tierNames[Tier.Supporter] = "Supporter";
        tierNames[Tier.Builder] = "Builder";
        tierNames[Tier.Architect] = "Architect";
        tierNames[Tier.Genesis] = "Genesis";
    }

    /// @notice Mint a membership badge
    function mint(Tier tier) external payable {
        require(tier != Tier.Genesis, "Genesis is invite-only");
        require(msg.value >= tierPrices[tier], "Insufficient payment");

        uint256 tokenId = nextTokenId++;
        badges[tokenId] = Badge(tier, block.timestamp, false);
        _safeMint(msg.sender, tokenId);

        emit BadgeMinted(msg.sender, tokenId, tier);
    }

    /// @notice Mint Genesis badge (owner only, soulbound)
    function mintGenesis(address to) external onlyOwner {
        require(genesisCount < MAX_GENESIS, "Genesis limit reached");

        uint256 tokenId = nextTokenId++;
        badges[tokenId] = Badge(Tier.Genesis, block.timestamp, true);
        genesisCount++;
        _safeMint(to, tokenId);

        emit BadgeMinted(to, tokenId, Tier.Genesis);
    }

    /// @notice Override transfer to enforce soulbound on Genesis badges
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        // Allow minting (from == address(0)) but block transfers of soulbound tokens
        if (from != address(0) && badges[tokenId].soulbound) {
            revert("Soulbound: non-transferable");
        }
        return super._update(to, tokenId, auth);
    }

    /// @notice On-chain SVG metadata
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        Badge memory badge = badges[tokenId];
        string memory color = tierColors[badge.tier];
        string memory name = tierNames[badge.tier];

        string memory svg = string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
            '<rect width="512" height="512" fill="#050508"/>',
            '<rect x="16" y="16" width="480" height="480" rx="24" fill="none" stroke="', color, '" stroke-width="2" opacity="0.5"/>',
            '<circle cx="256" cy="200" r="80" fill="none" stroke="', color, '" stroke-width="3"/>',
            '<text x="256" y="210" text-anchor="middle" fill="', color, '" font-family="monospace" font-size="40" font-weight="bold">W3</text>',
            '<text x="256" y="320" text-anchor="middle" fill="#e8e8f0" font-family="sans-serif" font-size="28" font-weight="bold">', name, '</text>',
            '<text x="256" y="360" text-anchor="middle" fill="#8888a0" font-family="monospace" font-size="14">#', tokenId.toString(), '</text>',
            '<text x="256" y="440" text-anchor="middle" fill="#8888a0" font-family="monospace" font-size="12">WWWIII MEMBERSHIP</text>',
            badge.soulbound ? '<text x="256" y="470" text-anchor="middle" fill="#ff3838" font-family="monospace" font-size="10">SOULBOUND</text>' : '',
            '</svg>'
        ));

        string memory json = string(abi.encodePacked(
            '{"name":"WWWIII ', name, ' #', tokenId.toString(), '",',
            '"description":"WWWIII membership badge — ', name, ' tier",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '",',
            '"attributes":[{"trait_type":"Tier","value":"', name, '"},',
            '{"trait_type":"Soulbound","value":"', badge.soulbound ? 'Yes' : 'No', '"},',
            '{"display_type":"date","trait_type":"Minted","value":', badge.mintedAt.toString(), '}]}'
        ));

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    /// @notice Withdraw collected ETH
    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    /// @notice Update tier price
    function setTierPrice(Tier tier, uint256 price) external onlyOwner {
        tierPrices[tier] = price;
    }

    /// @notice Set external metadata URI (optional override)
    function setBaseMetadataURI(string calldata uri) external onlyOwner {
        baseMetadataURI = uri;
    }
}

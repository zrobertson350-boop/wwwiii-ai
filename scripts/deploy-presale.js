const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying Presale with account:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

  // The existing WWWIII token on Sepolia
  const TOKEN_ADDRESS = "0x5201ee6ffb64aeA97Cf887bd6852ca572A15f33a";

  // Deploy presale contract
  const Presale = await hre.ethers.getContractFactory("WWWIIIPresale");
  const presale = await Presale.deploy(TOKEN_ADDRESS);
  await presale.waitForDeployment();
  const presaleAddress = await presale.getAddress();

  console.log("WWWIIIPresale deployed to:", presaleAddress);

  // Transfer community tokens (30% = 300M) to presale contract for distribution
  const token = await hre.ethers.getContractAt("WWWIII", TOKEN_ADDRESS);
  const presaleTokens = hre.ethers.parseEther("300000000"); // 300M tokens
  console.log("\nTransferring 300,000,000 WWWIII tokens to presale contract...");
  const tx = await token.transfer(presaleAddress, presaleTokens);
  await tx.wait();
  console.log("Tokens transferred!");

  // Activate the sale
  console.log("Activating presale...");
  const toggleTx = await presale.toggleSale();
  await toggleTx.wait();
  console.log("Sale is LIVE!\n");

  // Summary
  const remaining = await presale.tokensRemaining();
  console.log("=== PRESALE SUMMARY ===");
  console.log("Presale contract:", presaleAddress);
  console.log("Token contract:  ", TOKEN_ADDRESS);
  console.log("Tokens for sale: ", hre.ethers.formatEther(remaining), "WWWIII");
  console.log("Sale active:     ", await presale.saleActive());
  console.log("\nTiers:");
  console.log("  Supporter:  0.05 ETH → 50,000 WWWIII");
  console.log("  Builder:    0.25 ETH → 300,000 WWWIII");
  console.log("  Architect:  1.0 ETH  → 1,500,000 WWWIII");

  console.log("\nVerify on Etherscan:");
  console.log(`npx hardhat verify --network sepolia ${presaleAddress} ${TOKEN_ADDRESS}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

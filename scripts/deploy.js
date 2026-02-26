const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying WWWIII with account:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

  // All allocation wallets — replace with real multisig addresses before mainnet
  const devFund   = deployer.address; // TODO: multisig
  const community = deployer.address; // TODO: multisig
  const team      = deployer.address; // TODO: multisig
  const liquidity = deployer.address; // TODO: multisig
  const reserve   = deployer.address; // TODO: multisig

  console.log("Allocation addresses:");
  console.log("  Dev Fund:  ", devFund);
  console.log("  Community: ", community);
  console.log("  Team:      ", team);
  console.log("  Liquidity: ", liquidity);
  console.log("  Reserve:   ", reserve);
  console.log("");

  const WWWIII = await hre.ethers.getContractFactory("WWWIII");
  const token = await WWWIII.deploy(devFund, community, team, liquidity, reserve);

  await token.waitForDeployment();
  const address = await token.getAddress();

  console.log("WWWIII deployed to:", address);
  console.log("\nVerify on Etherscan:");
  console.log(`npx hardhat verify --network sepolia ${address} ${devFund} ${community} ${team} ${liquidity} ${reserve}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

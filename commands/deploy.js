'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const { ethers } = require('ethers');

const logger = require('../utils/logger');
const { handleError } = require('../utils/errorHandler');
const { loadConfig } = require('../utils/configLoader');

/**
 * Load a compiled artifact (ABI + bytecode) from the artifacts/ directory.
 */
function loadArtifact(contractName) {
  const artifactPath = path.join(process.cwd(), 'artifacts', `${contractName}.json`);

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`artifact not found: artifacts/${contractName}.json`);
  }

  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse artifacts/${contractName}.json: ${err.message}`);
  }

  if (!artifact.abi || !Array.isArray(artifact.abi)) {
    throw new Error(`abi not found in artifacts/${contractName}.json`);
  }

  if (!artifact.bytecode || artifact.bytecode === '0x' || artifact.bytecode === '') {
    throw new Error(`bytecode not found in artifacts/${contractName}.json — is this a real compiled artifact?`);
  }

  return artifact;
}

/**
 * Main deploy command.
 * @param {string} contractName - Name of the contract to deploy
 * @param {object} options      - CLI options (e.g. --gas-limit, --dry-run)
 */
async function deployCommand(contractName, options = {}) {
  logger.blank();

  // ── Load config ─────────────────────────────────────────────────────────────
  const config = loadConfig();

  const contractConfig = config.contracts?.[contractName];
  if (!contractConfig && !options.noConfig) {
    logger.warn(`No entry for "${contractName}" found in block67.config.js → contracts.`);
    logger.warn('Proceeding with no constructor args. Add args if your constructor requires them.');
  }

  const constructorArgs = contractConfig?.args ?? [];
  const gasLimit = options.gasLimit || config.gasLimit || undefined;

  // ── Load artifact ────────────────────────────────────────────────────────────
  let artifact;
  const loadSpinner = ora({ text: chalk.gray(`Loading artifact for ${contractName}...`), color: 'cyan' }).start();
  try {
    artifact = loadArtifact(contractName);
    loadSpinner.succeed(chalk.greenBright(`Artifact loaded: ${contractName}`));
  } catch (err) {
    loadSpinner.fail(chalk.red('Failed to load artifact'));
    handleError(err, `Loading artifact for "${contractName}"`);
    process.exit(1);
  }

  logger.blank();
  logger.divider();
  console.log(chalk.cyan.bold(`  DEPLOYING: ${contractName}`));
  logger.divider();
  logger.step('Network     ', config.network);
  logger.step('RPC         ', config.rpcUrl.replace(/\/[^/]+$/, '/****'));  // mask API key
  logger.step('Constructor ', constructorArgs.length ? JSON.stringify(constructorArgs) : '(none)');
  if (gasLimit) logger.step('Gas Limit   ', gasLimit.toString());
  logger.divider();
  logger.blank();

  // ── Dry run mode ─────────────────────────────────────────────────────────────
  if (options.dryRun) {
    logger.warn('Dry-run mode enabled — no transaction will be broadcast.');
    logger.success('Dry run passed: config and artifact look valid.');
    logger.blank();
    return;
  }

  // ── Connect to network ───────────────────────────────────────────────────────
  let provider, wallet;
  const connectSpinner = ora({ text: chalk.gray(`Connecting to ${config.network}...`), color: 'cyan' }).start();
  try {
    provider = new ethers.JsonRpcProvider(config.rpcUrl);
    await provider.getNetwork();  // will throw if RPC is unreachable
    wallet = new ethers.Wallet(config.privateKey, provider);
    connectSpinner.succeed(chalk.greenBright(`Connected to ${config.network}`));
  } catch (err) {
    connectSpinner.fail(chalk.red('Network connection failed'));
    handleError(err, `Connecting to ${config.network} via RPC`);
    process.exit(1);
  }

  // ── Wallet info ──────────────────────────────────────────────────────────────
  let balance;
  try {
    balance = await provider.getBalance(wallet.address);
    logger.step('Deployer    ', wallet.address);
    logger.step('Balance     ', ethers.formatEther(balance) + ' ETH');

    if (balance === 0n) {
      logger.warn('Deployer balance is 0 ETH. Transaction will likely fail with "insufficient funds".');
    }
  } catch (_) {
    // Non-fatal — continue
  }

  logger.blank();

  // ── Deploy ───────────────────────────────────────────────────────────────────
  const deploySpinner = ora({ text: chalk.gray(`Deploying ${contractName}...`), color: 'cyan' }).start();

  let deployedContract;
  try {
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

    const deployOptions = {};
    if (gasLimit) deployOptions.gasLimit = gasLimit;

    deployedContract = await factory.deploy(...constructorArgs, deployOptions);

    deploySpinner.text = chalk.gray('Waiting for transaction confirmation...');

    await deployedContract.waitForDeployment();
    deploySpinner.succeed(chalk.greenBright(`${contractName} deployed!`));
  } catch (err) {
    deploySpinner.fail(chalk.red('Deployment failed'));
    handleError(err, `Deploying ${contractName}`);
    process.exit(1);
  }

  // ── Success output ───────────────────────────────────────────────────────────
  const deployTx = deployedContract.deploymentTransaction();
  const contractAddress = await deployedContract.getAddress();

  logger.blank();
  logger.divider();
  console.log(chalk.green.bold('  DEPLOYMENT SUCCESSFUL'));
  logger.divider();
  logger.step('Contract    ', chalk.cyan(contractAddress));
  logger.step('Tx Hash     ', chalk.gray(deployTx?.hash ?? 'N/A'));
  logger.step('Gas Used    ', deployTx?.gasLimit ? deployTx.gasLimit.toString() : 'N/A');
  logger.step('Block       ', deployTx?.blockNumber ? deployTx.blockNumber.toString() : 'pending');

  const explorerBase = getExplorerUrl(config.network);
  if (explorerBase) {
    logger.step('Explorer    ', chalk.cyan(`${explorerBase}/address/${contractAddress}`));
    logger.step('Tx Link     ', chalk.cyan(`${explorerBase}/tx/${deployTx?.hash}`));
  }

  logger.divider();
  logger.blank();
}

/**
 * Map network name to a block explorer base URL.
 */
function getExplorerUrl(network) {
  const map = {
    mainnet: 'https://etherscan.io',
    sepolia: 'https://sepolia.etherscan.io',
    goerli: 'https://goerli.etherscan.io',
    polygon: 'https://polygonscan.com',
    mumbai: 'https://mumbai.polygonscan.com',
    arbitrum: 'https://arbiscan.io',
    optimism: 'https://optimistic.etherscan.io',
    base: 'https://basescan.org',
    bsc: 'https://bscscan.com',
  };
  return map[network?.toLowerCase()] ?? null;
}

module.exports = { deployCommand };

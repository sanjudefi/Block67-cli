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
const {
  getDeployment,
  recordDeployment,
  clearDeployment,
  timeAgo,
} = require('../utils/stateManager');

// ── Artifact loader ───────────────────────────────────────────────────────────

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

// ── Single-contract deploy core ───────────────────────────────────────────────

/**
 * Deploy one contract. Returns { skipped, address, txHash } or throws.
 *
 * @param {string} contractName
 * @param {object} config        - resolved config from loadConfig()
 * @param {object} options       - CLI options: force, dryRun, gasLimit
 */
async function deploySingle(contractName, config, options = {}) {
  const contractConfig = config.contracts?.[contractName];
  const constructorArgs = contractConfig?.args ?? [];
  const gasLimit = options.gasLimit || contractConfig?.gasLimit || config.gasLimit || undefined;

  // ── Idempotency check ──────────────────────────────────────────────────────
  const existing = getDeployment(config.network, contractName);
  if (existing && !options.force) {
    logger.blank();
    logger.divider();
    console.log(chalk.yellow.bold(`  SKIPPED: ${contractName}`));
    logger.divider();
    logger.step('Already at  ', chalk.cyan(existing.address));
    logger.step('Network     ', existing.network);
    logger.step('Deployed    ', timeAgo(existing.deployedAt));
    logger.step('Tx Hash     ', chalk.gray(existing.txHash));
    const explorerBase = getExplorerUrl(config.network);
    if (explorerBase) {
      logger.step('Explorer    ', chalk.cyan(`${explorerBase}/address/${existing.address}`));
    }
    logger.blank();
    console.log(chalk.gray('  Run with ') + chalk.cyan('--force') + chalk.gray(' to redeploy.'));
    logger.divider();
    logger.blank();
    return { skipped: true, address: existing.address };
  }

  if (existing && options.force) {
    logger.warn(`Forcing redeploy of ${contractName} (was at ${existing.address})`);
    clearDeployment(config.network, contractName);
  }

  // ── Load artifact ──────────────────────────────────────────────────────────
  let artifact;
  const loadSpinner = ora({ text: chalk.gray(`Loading artifact for ${contractName}...`), color: 'cyan' }).start();
  try {
    artifact = loadArtifact(contractName);
    loadSpinner.succeed(chalk.greenBright(`Artifact loaded: ${contractName}`));
  } catch (err) {
    loadSpinner.fail(chalk.red('Failed to load artifact'));
    throw err;
  }

  // ── Deploy header ──────────────────────────────────────────────────────────
  logger.blank();
  logger.divider();
  console.log(chalk.cyan.bold(`  DEPLOYING: ${contractName}`));
  logger.divider();
  logger.step('Network     ', config.network);
  logger.step('RPC         ', config.rpcUrl.replace(/\/[^/]{6,}$/, '/****'));
  logger.step('Constructor ', constructorArgs.length ? JSON.stringify(constructorArgs) : '(none)');
  if (gasLimit) logger.step('Gas Limit   ', gasLimit.toString());
  logger.divider();
  logger.blank();

  // ── Dry run ────────────────────────────────────────────────────────────────
  if (options.dryRun) {
    logger.warn('Dry-run mode enabled — no transaction will be broadcast.');
    logger.success('Dry run passed: config and artifact look valid.');
    logger.blank();
    return { skipped: false, dryRun: true };
  }

  // ── Connect ────────────────────────────────────────────────────────────────
  let provider, wallet;
  const connectSpinner = ora({ text: chalk.gray(`Connecting to ${config.network}...`), color: 'cyan' }).start();
  try {
    provider = new ethers.JsonRpcProvider(config.rpcUrl);
    await provider.getNetwork();
    wallet = new ethers.Wallet(config.privateKey, provider);
    connectSpinner.succeed(chalk.greenBright(`Connected to ${config.network}`));
  } catch (err) {
    connectSpinner.fail(chalk.red('Network connection failed'));
    throw err;
  }

  // ── Wallet balance ─────────────────────────────────────────────────────────
  try {
    const balance = await provider.getBalance(wallet.address);
    logger.step('Deployer    ', wallet.address);
    logger.step('Balance     ', ethers.formatEther(balance) + ' ETH');
    if (balance === 0n) {
      logger.warn('Deployer balance is 0 ETH. Transaction will likely fail with "insufficient funds".');
    }
  } catch (_) {}

  logger.blank();

  // ── Deploy ─────────────────────────────────────────────────────────────────
  const deploySpinner = ora({ text: chalk.gray(`Deploying ${contractName}...`), color: 'cyan' }).start();

  let deployedContract;
  try {
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const deployOptions = {};
    if (gasLimit) deployOptions.gasLimit = gasLimit;

    deployedContract = await factory.deploy(...constructorArgs, deployOptions);
    deploySpinner.text = chalk.gray('Waiting for confirmation...');
    await deployedContract.waitForDeployment();
    deploySpinner.succeed(chalk.greenBright(`${contractName} deployed!`));
  } catch (err) {
    deploySpinner.fail(chalk.red('Deployment failed'));
    throw err;
  }

  // ── Collect results ────────────────────────────────────────────────────────
  const deployTx = deployedContract.deploymentTransaction();
  const contractAddress = await deployedContract.getAddress();

  // Persist to state immediately — before printing, so a Ctrl+C still saves it
  recordDeployment(config.network, contractName, {
    address: contractAddress,
    txHash: deployTx?.hash ?? null,
    blockNumber: deployTx?.blockNumber ?? null,
    constructorArgs,
  });

  // ── Success output ─────────────────────────────────────────────────────────
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

  logger.step('State saved ', chalk.gray('block67-state.json'));
  logger.divider();
  logger.blank();

  return { skipped: false, address: contractAddress, txHash: deployTx?.hash };
}

// ── Public command entry points ───────────────────────────────────────────────

/**
 * Deploy a single named contract.
 */
async function deployCommand(contractName, options = {}) {
  logger.blank();
  const config = loadConfig({ network: options.network });

  if (!config.contracts?.[contractName] && !options.force) {
    logger.warn(`No entry for "${contractName}" found in block67.config.js → contracts.`);
    logger.warn('Proceeding with no constructor args. Add the contract to config.contracts if needed.');
  }

  try {
    await deploySingle(contractName, config, options);
  } catch (err) {
    handleError(err, `Deploying ${contractName}`);
    process.exit(1);
  }
}

/**
 * Deploy all contracts listed in config.contracts, in order.
 * Respects idempotency — already-deployed contracts are skipped unless --force.
 */
async function deployAllCommand(options = {}) {
  logger.blank();
  const config = loadConfig({ network: options.network });

  const contractNames = Object.keys(config.contracts ?? {});
  if (contractNames.length === 0) {
    logger.warn('No contracts defined in block67.config.js → contracts. Nothing to deploy.');
    return;
  }

  logger.info(`Deploying ${contractNames.length} contract(s): ${contractNames.join(', ')}`);
  logger.blank();

  const results = [];

  for (const name of contractNames) {
    try {
      const result = await deploySingle(name, config, options);
      results.push({ name, ...result, error: null });
    } catch (err) {
      handleError(err, `Deploying ${name}`);
      results.push({ name, skipped: false, address: null, error: err.message });
      if (!options.continueOnError) {
        logger.error('Stopping batch deploy. Use --continue-on-error to deploy remaining contracts despite failures.');
        break;
      }
    }
  }

  // ── Batch summary ────────────────────────────────────────────────────────
  logger.divider();
  console.log(chalk.cyan.bold('  DEPLOY SUMMARY'));
  logger.divider();

  for (const r of results) {
    if (r.error) {
      console.log(chalk.red('  ✖ ') + chalk.white(r.name.padEnd(20)) + chalk.red('FAILED   ') + chalk.gray(r.error.split('\n')[0].slice(0, 50)));
    } else if (r.skipped) {
      console.log(chalk.yellow('  ↷ ') + chalk.white(r.name.padEnd(20)) + chalk.yellow('SKIPPED  ') + chalk.gray(r.address));
    } else if (r.dryRun) {
      console.log(chalk.cyan('  ○ ') + chalk.white(r.name.padEnd(20)) + chalk.cyan('DRY RUN'));
    } else {
      console.log(chalk.green('  ✔ ') + chalk.white(r.name.padEnd(20)) + chalk.green('DEPLOYED ') + chalk.cyan(r.address));
    }
  }

  logger.divider();
  logger.blank();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

module.exports = { deployCommand, deployAllCommand };

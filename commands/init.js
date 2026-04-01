'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const logger = require('../utils/logger');

const CONFIG_TEMPLATE = `require('dotenv').config();

module.exports = {
  // Target network: mainnet | sepolia | goerli | polygon | localhost
  network: "sepolia",

  // RPC endpoint — load from .env (recommended) or paste directly
  rpcUrl: process.env.RPC_URL,

  // Deployer wallet private key — NEVER commit this to git
  privateKey: process.env.PRIVATE_KEY,

  // Optional: override gas limit globally
  // gasLimit: 3000000,

  contracts: {
    // Contract name must match your compiled artifact filename
    // e.g. artifacts/MyToken.json
    MyToken: {
      args: ["Test Token", "TT", 1000000]
    }
  }
};
`;

const ENV_TEMPLATE = `# block67 environment variables
# Copy this file to .env and fill in your values
# NEVER commit your actual .env to git

RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
PRIVATE_KEY=YOUR_DEPLOYER_WALLET_PRIVATE_KEY_WITHOUT_0x

# Optional: enable full stack traces on error
# BLOCK67_DEBUG=1

# Optional: AI-powered error diagnostics (Claude)
# ANTHROPIC_API_KEY=your_key_here
`;

const GITIGNORE_ADDITION = `
# block67
.env
artifacts/
`;

async function initCommand() {
  logger.blank();
  logger.info('Initializing block67 project...');
  logger.blank();

  const cwd = process.cwd();

  // ── block67.config.js ───────────────────────────────────────────────────────
  const configPath = path.join(cwd, 'block67.config.js');
  if (fs.existsSync(configPath)) {
    logger.warn('block67.config.js already exists — skipping.');
  } else {
    fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf8');
    logger.success('Created block67.config.js');
  }

  // ── .env.example ────────────────────────────────────────────────────────────
  const envExamplePath = path.join(cwd, '.env.example');
  if (fs.existsSync(envExamplePath)) {
    logger.warn('.env.example already exists — skipping.');
  } else {
    fs.writeFileSync(envExamplePath, ENV_TEMPLATE, 'utf8');
    logger.success('Created .env.example');
  }

  // ── .gitignore ──────────────────────────────────────────────────────────────
  const gitignorePath = path.join(cwd, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, GITIGNORE_ADDITION.trim() + '\n', 'utf8');
    logger.success('Created .gitignore');
  } else {
    const existing = fs.readFileSync(gitignorePath, 'utf8');
    if (!existing.includes('.env')) {
      fs.appendFileSync(gitignorePath, GITIGNORE_ADDITION, 'utf8');
      logger.success('Updated .gitignore (added .env and artifacts/)');
    } else {
      logger.warn('.gitignore already has .env entry — skipping.');
    }
  }

  // ── artifacts/ directory ────────────────────────────────────────────────────
  const artifactsDir = path.join(cwd, 'artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
    logger.success('Created artifacts/ directory');

    // Drop a sample artifact so developers know the expected format
    const sampleArtifact = {
      contractName: "MyToken",
      abi: [
        {
          "inputs": [
            { "internalType": "string", "name": "name", "type": "string" },
            { "internalType": "string", "name": "symbol", "type": "string" },
            { "internalType": "uint256", "name": "initialSupply", "type": "uint256" }
          ],
          "stateMutability": "nonpayable",
          "type": "constructor"
        }
      ],
      bytecode: "0x"
    };
    fs.writeFileSync(
      path.join(artifactsDir, 'MyToken.json'),
      JSON.stringify(sampleArtifact, null, 2),
      'utf8'
    );
    logger.success('Created artifacts/MyToken.json (sample — replace with real compiled artifact)');
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  logger.blank();
  logger.divider();
  console.log(chalk.cyan.bold('  Project initialized! Next steps:'));
  logger.divider();
  console.log(chalk.gray('  1.') + ' Copy .env.example to .env and fill in your keys');
  console.log(chalk.gray('  2.') + ' Compile your Solidity contract and place the artifact in artifacts/');
  console.log(chalk.gray('  3.') + ' Edit block67.config.js to match your contract');
  console.log(chalk.gray('  4.') + ' Run ' + chalk.cyan('block67 deploy MyToken'));
  logger.divider();
  logger.blank();
}

module.exports = { initCommand };

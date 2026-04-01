'use strict';

const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const { handleError } = require('./errorHandler');

/**
 * Load block67.config.js from the current working directory.
 * Supports both the flat rpcUrl style and the networks map style.
 *
 * Flat style (original):
 *   { network: "sepolia", rpcUrl: process.env.RPC_URL, ... }
 *
 * Networks map style (multi-chain):
 *   {
 *     network: "sepolia",
 *     networks: {
 *       sepolia:  { rpcUrl: process.env.SEPOLIA_RPC_URL,  chainId: 11155111 },
 *       mainnet:  { rpcUrl: process.env.MAINNET_RPC_URL,  chainId: 1        },
 *       localhost:{ rpcUrl: "http://127.0.0.1:8545",       chainId: 31337    },
 *     },
 *     ...
 *   }
 *
 * The active network is selected by config.network (or --network CLI flag via
 * options.network passed in). Per-network rpcUrl always wins over the global one.
 */
function loadConfig(options = {}) {
  const configPath = path.join(process.cwd(), 'block67.config.js');

  if (!fs.existsSync(configPath)) {
    handleError(
      new Error('config not found'),
      'Looking for block67.config.js in ' + process.cwd()
    );
    process.exit(1);
  }

  let config;
  try {
    delete require.cache[require.resolve(configPath)];
    config = require(configPath);
  } catch (err) {
    handleError(err, 'Failed to parse block67.config.js');
    process.exit(1);
  }

  // ── Active network ────────────────────────────────────────────────────────────
  // CLI --network flag overrides config.network
  const network = options.network || config.network || 'sepolia';
  config.network = network;

  // ── RPC URL resolution (networks map takes priority) ─────────────────────────
  let rpcUrl = null;

  if (config.networks && config.networks[network]) {
    const netCfg = config.networks[network];
    rpcUrl = netCfg.rpcUrl || null;
    // Merge chainId if provided
    if (netCfg.chainId) config.chainId = netCfg.chainId;
  }

  // Fall back to global rpcUrl, then env var
  rpcUrl = rpcUrl || config.rpcUrl || process.env.RPC_URL || null;

  // Also try a network-specific env var: SEPOLIA_RPC_URL, MAINNET_RPC_URL, etc.
  if (!rpcUrl) {
    const envKey = `${network.toUpperCase()}_RPC_URL`;
    rpcUrl = process.env[envKey] || null;
  }

  if (!rpcUrl) {
    handleError(
      new Error('rpc url not set'),
      `No RPC URL found for network "${network}". ` +
      `Set networks.${network}.rpcUrl in block67.config.js, or add RPC_URL / ${network.toUpperCase()}_RPC_URL to your .env`
    );
    process.exit(1);
  }
  config.rpcUrl = rpcUrl;

  // ── Private key ───────────────────────────────────────────────────────────────
  const privateKey = config.privateKey || process.env.PRIVATE_KEY;
  if (!privateKey) {
    handleError(new Error('private key not set'), 'block67.config.js → privateKey or PRIVATE_KEY env var');
    process.exit(1);
  }
  const cleaned = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  if (!/^[0-9a-fA-F]{64}$/.test(cleaned)) {
    handleError(new Error('invalid private key'), 'PRIVATE_KEY format check');
    process.exit(1);
  }
  config.privateKey = privateKey;

  return config;
}

module.exports = { loadConfig };

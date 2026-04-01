'use strict';

const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const { handleError } = require('./errorHandler');

/**
 * Load block67.config.js from the current working directory.
 * Validates required fields and returns the config object.
 */
function loadConfig() {
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
    // Clear require cache so config changes are picked up without restarting
    delete require.cache[require.resolve(configPath)];
    config = require(configPath);
  } catch (err) {
    handleError(err, 'Failed to parse block67.config.js');
    process.exit(1);
  }

  // Validate network
  if (!config.network) {
    logger.warn('No "network" found in block67.config.js. Defaulting to "sepolia".');
    config.network = 'sepolia';
  }

  // Validate rpcUrl
  const rpcUrl = config.rpcUrl || process.env.RPC_URL;
  if (!rpcUrl) {
    handleError(new Error('rpc url not set'), 'block67.config.js → rpcUrl or RPC_URL env var');
    process.exit(1);
  }
  config.rpcUrl = rpcUrl;

  // Validate privateKey
  const privateKey = config.privateKey || process.env.PRIVATE_KEY;
  if (!privateKey) {
    handleError(new Error('private key not set'), 'block67.config.js → privateKey or PRIVATE_KEY env var');
    process.exit(1);
  }

  // Basic format check
  const cleaned = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  if (!/^[0-9a-fA-F]{64}$/.test(cleaned)) {
    handleError(new Error('invalid private key'), 'PRIVATE_KEY format check');
    process.exit(1);
  }
  config.privateKey = privateKey;

  return config;
}

module.exports = { loadConfig };

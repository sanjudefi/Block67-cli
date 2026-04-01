'use strict';

const fs = require('fs');
const path = require('path');

const STATE_FILE = 'block67-state.json';

/**
 * Resolve the state file path (always relative to cwd, i.e. the project root).
 */
function statePath() {
  return path.join(process.cwd(), STATE_FILE);
}

/**
 * Load the full state object from disk.
 * Returns a fresh state if the file does not exist or is corrupt.
 */
function loadState() {
  const p = statePath();
  if (!fs.existsSync(p)) {
    return { version: 1, deployments: {} };
  }
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    // Ensure structure is sound even if file was hand-edited
    if (!parsed.deployments || typeof parsed.deployments !== 'object') {
      parsed.deployments = {};
    }
    return parsed;
  } catch (_) {
    // Corrupt state — start fresh rather than crashing
    return { version: 1, deployments: {} };
  }
}

/**
 * Persist the state object to disk, atomically (write-then-rename).
 */
function saveState(state) {
  const p = statePath();
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

/**
 * Look up a deployment record.
 * @returns {object|null}
 */
function getDeployment(network, contractName) {
  const state = loadState();
  return state.deployments?.[network]?.[contractName] ?? null;
}

/**
 * Save a successful deployment record.
 */
function recordDeployment(network, contractName, record) {
  const state = loadState();
  if (!state.deployments[network]) {
    state.deployments[network] = {};
  }
  state.deployments[network][contractName] = {
    contractName,
    network,
    address: record.address,
    txHash: record.txHash,
    blockNumber: record.blockNumber ?? null,
    constructorArgs: record.constructorArgs ?? [],
    deployedAt: new Date().toISOString(),
  };
  saveState(state);
}

/**
 * Return all deployments, optionally filtered by network.
 * Returns: { [network]: { [contractName]: record } }
 */
function allDeployments(networkFilter) {
  const state = loadState();
  if (networkFilter) {
    return { [networkFilter]: state.deployments[networkFilter] ?? {} };
  }
  return state.deployments;
}

/**
 * Remove a single deployment record (e.g. after --force redeploy starts,
 * so stale data is not kept if the new deploy fails).
 */
function clearDeployment(network, contractName) {
  const state = loadState();
  if (state.deployments?.[network]?.[contractName]) {
    delete state.deployments[network][contractName];
    saveState(state);
  }
}

/**
 * Human-readable time-ago string.
 */
function timeAgo(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

module.exports = {
  loadState,
  saveState,
  getDeployment,
  recordDeployment,
  allDeployments,
  clearDeployment,
  timeAgo,
  STATE_FILE,
};

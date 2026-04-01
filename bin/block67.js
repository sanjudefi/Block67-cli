#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { program } = require('commander');
const chalk = require('chalk');
const logger = require('../utils/logger');
const { initCommand } = require('../commands/init');
const { deployCommand, deployAllCommand } = require('../commands/deploy');
const pkg = require('../package.json');

// ── Global error safety net ───────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  const { handleError } = require('../utils/errorHandler');
  handleError(err, 'Unexpected runtime error');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const { handleError } = require('../utils/errorHandler');
  handleError(reason instanceof Error ? reason : new Error(String(reason)), 'Unhandled async error');
  process.exit(1);
});

// ── CLI setup ─────────────────────────────────────────────────────────────────
program
  .name('block67')
  .description(chalk.cyan('Developer-first CLI for smart contract deployment'))
  .version(pkg.version, '-v, --version', 'Print block67 version');

// ── init ──────────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Initialize a new block67 project in the current directory')
  .action(async () => {
    logger.banner();
    await initCommand();
  });

// ── deploy ────────────────────────────────────────────────────────────────────
program
  .command('deploy [contractName]')
  .description('Deploy a contract (or all contracts with --all) using block67.config.js')
  .option('--all', 'Deploy all contracts defined in block67.config.js → contracts')
  .option('--force', 'Redeploy even if a deployment record already exists in block67-state.json')
  .option('--dry-run', 'Validate config and artifact without sending a transaction')
  .option('--network <name>', 'Override the active network (must exist in config.networks)')
  .option('--gas-limit <limit>', 'Override gas limit for this deployment', parseInt)
  .option('--continue-on-error', 'With --all: continue deploying remaining contracts if one fails')
  .action(async (contractName, options) => {
    logger.banner();

    if (options.all) {
      await deployAllCommand(options);
    } else if (contractName) {
      await deployCommand(contractName, options);
    } else {
      logger.error('Specify a contract name or use --all to deploy everything.');
      logger.info('  block67 deploy MyToken');
      logger.info('  block67 deploy --all');
      process.exit(1);
    }
  });

// ── status ────────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show all contracts recorded in block67-state.json')
  .option('--network <name>', 'Filter by network')
  .action((options) => {
    logger.banner();
    const { allDeployments, timeAgo } = require('../utils/stateManager');
    const deployments = allDeployments(options.network);

    const networks = Object.keys(deployments);
    if (networks.length === 0) {
      logger.warn('No deployments recorded yet.');
      logger.info('Run block67 deploy <ContractName> to deploy your first contract.');
      logger.blank();
      return;
    }

    logger.blank();
    for (const net of networks) {
      const contracts = deployments[net];
      const names = Object.keys(contracts);
      if (names.length === 0) continue;

      logger.divider();
      console.log(chalk.cyan.bold(`  NETWORK: ${net.toUpperCase()}`));
      logger.divider();

      for (const name of names) {
        const rec = contracts[name];
        console.log(chalk.green('  ✔ ') + chalk.white.bold(name));
        console.log(chalk.gray('    Address  : ') + chalk.cyan(rec.address));
        console.log(chalk.gray('    Tx Hash  : ') + chalk.gray(rec.txHash ?? 'N/A'));
        console.log(chalk.gray('    Deployed : ') + chalk.white(timeAgo(rec.deployedAt) + '  (' + rec.deployedAt + ')'));
        if (rec.constructorArgs?.length) {
          console.log(chalk.gray('    Args     : ') + chalk.white(JSON.stringify(rec.constructorArgs)));
        }
        logger.blank();
      }
    }

    logger.divider();
    console.log(chalk.gray('  State file: ') + chalk.white('block67-state.json'));
    logger.divider();
    logger.blank();
  });

// ── doctor ────────────────────────────────────────────────────────────────────
program
  .command('doctor')
  .description('Check your block67 environment: config, .env, and artifact setup')
  .action(async () => {
    logger.banner();
    const fs = require('fs');
    const path = require('path');

    logger.info('Running environment check...');
    logger.blank();

    const checks = [
      {
        label: 'block67.config.js',
        ok: fs.existsSync(path.join(process.cwd(), 'block67.config.js')),
        fix: 'Run block67 init'
      },
      {
        label: '.env file',
        ok: fs.existsSync(path.join(process.cwd(), '.env')),
        fix: 'Copy .env.example to .env and fill in your keys'
      },
      {
        label: 'RPC_URL set',
        ok: !!(process.env.RPC_URL || process.env.SEPOLIA_RPC_URL || process.env.MAINNET_RPC_URL),
        fix: 'Add RPC_URL or <NETWORK>_RPC_URL to your .env file'
      },
      {
        label: 'PRIVATE_KEY set',
        ok: !!process.env.PRIVATE_KEY,
        fix: 'Add PRIVATE_KEY to your .env file'
      },
      {
        label: 'artifacts/ directory',
        ok: fs.existsSync(path.join(process.cwd(), 'artifacts')),
        fix: 'Run block67 init or create artifacts/ and add your compiled contract JSON'
      },
      {
        label: 'block67-state.json',
        ok: fs.existsSync(path.join(process.cwd(), 'block67-state.json')),
        fix: 'State file is created automatically on first deployment — nothing to do'
      }
    ];

    let allPassed = true;
    for (const check of checks) {
      if (check.ok) {
        console.log(chalk.green('  ✔ ') + chalk.white(check.label));
      } else {
        const isFatal = check.label !== 'block67-state.json';
        const icon = isFatal ? chalk.red('  ✖ ') : chalk.yellow('  ○ ');
        console.log(icon + chalk.white(check.label) + chalk.gray('  →  ') + chalk.yellow(check.fix));
        if (isFatal) allPassed = false;
      }
    }

    logger.blank();
    if (allPassed) {
      logger.success('All checks passed. You are ready to deploy!');
    } else {
      logger.warn('Some checks failed. Fix the issues above and run block67 doctor again.');
    }
    logger.blank();
  });

// ── errors ────────────────────────────────────────────────────────────────────
program
  .command('errors')
  .description('Show the full list of known deployment errors and their fixes')
  .action(() => {
    const ERRORS = require('../templates/errors.json');

    logger.blank();
    logger.divider();
    console.log(chalk.cyan.bold('  BLOCK67 ERROR CATALOGUE'));
    logger.divider();
    logger.blank();

    for (const [key, val] of Object.entries(ERRORS)) {
      console.log(chalk.yellow.bold(`  "${key}"`));
      console.log(chalk.gray('  Reason : ') + chalk.white(val.reason));
      console.log(chalk.gray('  Fix    : ') + chalk.greenBright(val.fix));
      if (val.docs) {
        console.log(chalk.gray('  Docs   : ') + chalk.cyan(val.docs));
      }
      logger.blank();
    }

    logger.divider();
    logger.blank();
  });

// ── Fallback for unknown commands ─────────────────────────────────────────────
program.on('command:*', () => {
  logger.blank();
  logger.error(`Unknown command: ${program.args.join(' ')}`);
  logger.info('Run block67 --help to see available commands.');
  logger.blank();
  process.exit(1);
});

// ── Show banner + help if no args ─────────────────────────────────────────────
if (process.argv.length <= 2) {
  logger.banner();
  program.help();
}

program.parse(process.argv);

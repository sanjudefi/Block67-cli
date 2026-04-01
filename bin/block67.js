#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { program } = require('commander');
const chalk = require('chalk');
const logger = require('../utils/logger');
const { initCommand } = require('../commands/init');
const { deployCommand } = require('../commands/deploy');
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
  .command('deploy <contractName>')
  .description('Deploy a compiled smart contract using your block67.config.js')
  .option('--dry-run', 'Validate config and artifact without sending a transaction')
  .option('--gas-limit <limit>', 'Override gas limit for this deployment', parseInt)
  .action(async (contractName, options) => {
    logger.banner();
    await deployCommand(contractName, options);
  });

// ── doctor (quick environment check) ─────────────────────────────────────────
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
        ok: !!process.env.RPC_URL,
        fix: 'Add RPC_URL to your .env file'
      },
      {
        label: 'PRIVATE_KEY set',
        ok: !!process.env.PRIVATE_KEY,
        fix: 'Add PRIVATE_KEY to your .env file'
      },
      {
        label: 'artifacts/ directory',
        ok: fs.existsSync(path.join(process.cwd(), 'artifacts')),
        fix: 'Run block67 init or create artifacts/ manually and add your compiled contract JSON'
      }
    ];

    let allPassed = true;
    for (const check of checks) {
      if (check.ok) {
        console.log(chalk.green('  ✔ ') + chalk.white(check.label));
      } else {
        console.log(chalk.red('  ✖ ') + chalk.white(check.label) + chalk.gray('  →  ') + chalk.yellow(check.fix));
        allPassed = false;
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

// ── errors (show the full error catalogue) ────────────────────────────────────
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

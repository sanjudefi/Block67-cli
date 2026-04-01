'use strict';

const chalk = require('chalk');
const path = require('path');
const logger = require('./logger');

const ERRORS = require(path.join(__dirname, '../templates/errors.json'));

/**
 * Match an error message against the known error templates.
 * Returns the best matching template entry or null.
 */
function matchError(errorMessage) {
  if (!errorMessage) return null;
  const lower = errorMessage.toLowerCase();

  for (const [key, value] of Object.entries(ERRORS)) {
    if (lower.includes(key.toLowerCase())) {
      return { key, ...value };
    }
  }
  return null;
}

/**
 * Main error handler — call this any time a deployment or config error occurs.
 * Prints a clean, structured explanation to the developer.
 */
function handleError(err, context = '') {
  const raw = err?.message || err?.toString() || 'Unknown error';

  logger.blank();
  logger.divider();
  console.log(chalk.red.bold('  DEPLOYMENT FAILED'));
  logger.divider();

  if (context) {
    console.log(chalk.gray('  Context : ') + chalk.white(context));
  }

  console.log(chalk.gray('  Raw Msg : ') + chalk.red(raw.split('\n')[0]));

  const match = matchError(raw);

  if (match) {
    logger.blank();
    console.log(chalk.yellow.bold('  DIAGNOSIS'));
    logger.divider();
    console.log(chalk.gray('  Reason  : ') + chalk.whiteBright(match.reason));
    console.log(chalk.gray('  Fix     : ') + chalk.greenBright(match.fix));

    if (match.docs) {
      console.log(chalk.gray('  Docs    : ') + chalk.cyan(match.docs));
    }
  } else {
    logger.blank();
    console.log(chalk.yellow.bold('  DIAGNOSIS'));
    logger.divider();
    console.log(chalk.gray('  Reason  : ') + chalk.white('Unrecognized error. See raw message above.'));
    console.log(
      chalk.gray('  Fix     : ') +
        chalk.white('Search the error message online, or open an issue at ') +
        chalk.cyan('https://github.com/sanjudefi/block67-cli')
    );

    // Print full stack in debug mode
    if (process.env.BLOCK67_DEBUG === '1') {
      logger.blank();
      console.log(chalk.gray(err?.stack || ''));
    } else {
      logger.blank();
      console.log(chalk.gray('  Tip: Set BLOCK67_DEBUG=1 in your .env to see the full stack trace.'));
    }
  }

  logger.divider();
  logger.blank();
}

module.exports = { handleError, matchError };

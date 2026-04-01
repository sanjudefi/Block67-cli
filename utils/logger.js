'use strict';

const chalk = require('chalk');

const PREFIX = chalk.cyan.bold('[block67]');

const logger = {
  info(msg) {
    console.log(`${PREFIX} ${chalk.white(msg)}`);
  },

  success(msg) {
    console.log(`${PREFIX} ${chalk.green('✔')} ${chalk.greenBright(msg)}`);
  },

  warn(msg) {
    console.log(`${PREFIX} ${chalk.yellow('⚠')} ${chalk.yellow(msg)}`);
  },

  error(msg) {
    console.log(`${PREFIX} ${chalk.red('✖')} ${chalk.redBright(msg)}`);
  },

  step(label, value) {
    console.log(`${PREFIX} ${chalk.gray(label + ':')} ${chalk.whiteBright(value)}`);
  },

  divider() {
    console.log(chalk.gray('─'.repeat(55)));
  },

  blank() {
    console.log('');
  },

  banner() {
    console.log('');
    console.log(chalk.cyan.bold('  ██████╗ ██╗      ██████╗  ██████╗██╗  ██╗ ██████╗ ███████╗'));
    console.log(chalk.cyan.bold('  ██╔══██╗██║     ██╔═══██╗██╔════╝██║ ██╔╝██╔════╝ ╚════██║'));
    console.log(chalk.cyan.bold('  ██████╔╝██║     ██║   ██║██║     █████╔╝ ███████╗     ██╔╝'));
    console.log(chalk.cyan.bold('  ██╔══██╗██║     ██║   ██║██║     ██╔═██╗ ██╔═══██╗   ██╔╝ '));
    console.log(chalk.cyan.bold('  ██████╔╝███████╗╚██████╔╝╚██████╗██║  ██╗╚██████╔╝   ██║  '));
    console.log(chalk.cyan.bold('  ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝ ╚═════╝    ╚═╝  '));
    console.log('');
    console.log(chalk.gray('  Developer-first smart contract CLI  ') + chalk.cyan('v1.0.0'));
    console.log('');
  }
};

module.exports = logger;

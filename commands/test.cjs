#!/usr/bin/env node

'use strict';

async function run(args = process.argv.slice(2), context = {}) {
  const cwd = context.cwd || process.cwd();

  console.log(`ffs test running in: ${cwd}`);

  if (args.length > 0) {
    console.log(`args: ${args.join(' ')}`);
  }

  return 0;
}

if (require.main === module) {
  run(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = Number.isInteger(exitCode) ? exitCode : 0;
    })
    .catch((error) => {
      console.error(error && error.stack ? error.stack : error);
      process.exitCode = 1;
    });
}

module.exports = {
  run,
};
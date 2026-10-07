#!/usr/bin/env node
const dns = require('dns');
const path = require('path');

const { listRepositories, getRepository } = require('../services/repositoryRegistry');
const { harvestRepository, buildUserAgent, DEFAULT_DELAY_MS } = require('../services/repositoryHarvester');

const USAGE = `
Usage:
  node scripts/harvestRepository.js --list
  node scripts/harvestRepository.js --repo <key> [options]

Options:
  --repo <key>       Repository to harvest (see --list).
  --from <date>      Only records that CHANGED IN THE REPOSITORY on or after this date (YYYY-MM-DD).
                     This is the repository's "last modified" date, not the year of the thesis.
  --until <date>     Only records changed on or before this date (YYYY-MM-DD).
  --max <n>          Stop after reading n records (kept or skipped).
  --dry-run          Show what would be stored. Writes nothing and does not open the database.
  --resume <token>   Continue an earlier run from the "resume token" it printed.
  --delay <ms>       Pause between requests (default ${DEFAULT_DELAY_MS}). Please do not go below 1000.
  --force            Allow a repository marked "enabled: false" in the registry (unverified).
  --list             Show the registry and exit.
  --help             Show this text.

Environment (backend/.env):
  HARVEST_CONTACT_EMAIL   required. Sent to the repository so its administrator can reach you.
  HARVEST_SITE_URL        optional. Public address of this site, sent alongside the email.
  MONGODB_URI             required unless --dry-run or --list.
`;

function loadEnvironment() {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  } catch (e) {}
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const FLAG_OPTIONS = new Set(['dry-run', 'list', 'force', 'help']);
const VALUE_OPTIONS = new Set(['repo', 'from', 'until', 'max', 'resume', 'delay']);

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument "${arg}".`);
    const [rawName, inlineValue] = arg.slice(2).split(/=(.*)/s, 2);
    if (FLAG_OPTIONS.has(rawName)) {
      if (inlineValue !== undefined) throw new Error(`Option --${rawName} does not take a value.`);
      options[rawName] = true;
    } else if (VALUE_OPTIONS.has(rawName)) {
      const value = inlineValue !== undefined ? inlineValue : argv[i += 1];
      if (value === undefined || value === '' || String(value).startsWith('--')) throw new Error(`Option --${rawName} needs a value.`);
      options[rawName] = value;
    } else {
      throw new Error(`Unknown option "--${rawName}".`);
    }
  }
  return options;
}

function positiveInteger(value, name) {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(String(value)) || Number(value) <= 0) throw new Error(`--${name} must be a whole number greater than 0.`);
  return Number(value);
}

function printRegistry() {
  console.log('\nRepositories known to the harvester (services/repositoryRegistry.js):\n');
  for (const repo of listRepositories()) {
    console.log(`  ${repo.key.padEnd(8)} ${repo.enabled ? 'ENABLED ' : 'disabled'}  ${repo.name}`);
    console.log(`           ${repo.oaiBaseUrl}  (format: ${repo.metadataPrefix})`);
    console.log(`           ${repo.notes}\n`);
  }
  console.log('Disabled entries are unverified. They only run with --force, and should be tried with --dry-run first.\n');
}

function formatSkipped(skipped) {
  const entries = Object.entries(skipped).sort((a, b) => b[1] - a[1]);
  return entries.length === 0 ? 'none' : entries.map(([reason, count]) => `${reason}: ${count}`).join(', ');
}

function printSample(thesis, index) {
  console.log(`  Sample ${index + 1}`);
  console.log(`    title        ${thesis.title}`);
  console.log(`    author       ${thesis.author}`);
  console.log(`    advisor      ${thesis.advisor || '(not stated)'}`);
  console.log(`    university   ${thesis.university} / ${thesis.department}`);
  console.log(`    degree       ${thesis.degreeType} (${thesis.publicationType}), year ${thesis.publishedYear || '(not stated)'}`);
  console.log(`    category     ${thesis.category}`);
  console.log(`    link back    ${thesis.sourceUrl}`);
  console.log(`    external id  ${thesis.externalId}`);
  console.log(`    abstract     ${thesis.abstract.length > 220 ? `${thesis.abstract.slice(0, 220)}...` : thesis.abstract}\n`);
}

function printSummary(summary, repository) {
  const verb = summary.dryRun ? 'would be ' : '';
  console.log('\n---------------------------------------------------------------');
  console.log(`  ${summary.dryRun ? 'DRY RUN - nothing was written' : 'Harvest finished'}: ${repository.name}`);
  console.log('---------------------------------------------------------------');
  console.log(`  Requests sent        ${summary.requests}  (format: ${summary.metadataPrefix})`);
  console.log(`  Records read         ${summary.fetched}${summary.completeListSize ? ` of ${summary.completeListSize} the repository reports for this query` : ''}`);
  if (summary.dryRun) {
    console.log(`  Would be stored      ${summary.inserted}  (the database was not opened, so new and already-known records are not told apart)`);
  } else {
    console.log(`  Inserted             ${summary.inserted}`);
    console.log(`  Updated              ${summary.updated}`);
    console.log(`  Unchanged            ${summary.unchanged}`);
    console.log(`  Hidden (deleted at source)  ${summary.deleted}`);
  }
  console.log(`  Skipped              ${formatSkipped(summary.skipped)}`);
  console.log(`  Errors               ${summary.errorCount}`);
  for (const message of summary.errors) console.log(`    ✗ ${message}`);
  if (summary.errorCount > summary.errors.length) console.log(`    ... and ${summary.errorCount - summary.errors.length} more`);

  if (summary.complete) {
    console.log('  The repository had no more records for this query.');
  } else if (summary.lastResumptionToken) {
    console.log(`  Stopped before the end. To continue from here, add:  --resume "${summary.lastResumptionToken}"`);
  } else {
    console.log(`  Stopped before the end of the first page. Run again (${verb}safe: records are matched by id, never duplicated).`);
  }
  console.log('');
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    console.log(USAGE);
    return 1;
  }

  if (options.help || argv.length === 0) {
    console.log(USAGE);
    return options.help ? 0 : 1;
  }
  if (options.list) {
    printRegistry();
    return 0;
  }

  const dryRun = Boolean(options['dry-run']);
  let maxRecords;
  let delayMs;
  try {
    maxRecords = positiveInteger(options.max, 'max');
    delayMs = options.delay === undefined ? undefined : Number(positiveInteger(options.delay, 'delay'));
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }

  if (!options.repo) {
    console.error('✗ Missing --repo <key>. Use --list to see the available repositories.');
    return 1;
  }
  const repository = getRepository(options.repo);
  if (!repository) {
    console.error(`✗ Unknown repository "${options.repo}". Use --list to see the available repositories.`);
    return 1;
  }
  if (!repository.enabled && !options.force) {
    console.error(`✗ Repository "${repository.key}" is not enabled: ${repository.notes}`);
    console.error('  If you have checked it yourself, run again with --force (and --dry-run the first time).');
    return 1;
  }

  let userAgent;
  try {
    userAgent = buildUserAgent();
  } catch (err) {
    console.error(`✗ ${err.message}`);
    console.error('  Add HARVEST_CONTACT_EMAIL=you@example.org to backend/.env.');
    return 1;
  }
  if (!dryRun && !process.env.MONGODB_URI) {
    console.error('✗ Fatal Error: MONGODB_URI environment variable is required (or use --dry-run).');
    return 1;
  }

  console.log(`\nHarvesting ${repository.name} (${repository.key})`);
  console.log(`  Endpoint    ${repository.oaiBaseUrl}`);
  console.log(`  Identify as ${userAgent}`);
  console.log(`  Range       changed from ${options.from || 'the beginning'} until ${options.until || 'now'}${maxRecords ? `, at most ${maxRecords} records` : ''}`);
  console.log(`  Mode        ${dryRun ? 'DRY RUN (nothing will be written)' : 'LIVE (records will be written to the database)'}\n`);

  let mongoose = null;
  let Thesis = null;
  let exitCode = 0;

  try {
    if (!dryRun) {
      mongoose = require('mongoose');
      Thesis = require('../models/Thesis');
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to database.');
      await Thesis.init();
    }

    const summary = await harvestRepository({
      repository,
      from: options.from,
      until: options.until,
      maxRecords,
      resumptionToken: options.resume,
      delayMs,
      ThesisModel: Thesis,
      dryRun,
      onProgress: (progress) => {
        if (progress.event === 'waiting') {
          console.log(`  ... ${progress.reason}; waiting ${Math.round(progress.waitMs / 1000)}s before retry ${progress.attempt}`);
        } else if (progress.event === 'page') {
          const total = progress.completeListSize ? ` of ${progress.completeListSize}` : '';
          const skipped = Object.values(progress.skipped).reduce((sum, count) => sum + count, 0);
          console.log(`  page ${progress.page}: read ${progress.fetched}${total} | ${dryRun ? 'would store' : 'inserted'} ${progress.inserted}${dryRun ? '' : `, updated ${progress.updated}, unchanged ${progress.unchanged}`} | skipped ${skipped} | errors ${progress.errorCount}`);
        }
      },
    });

    if (dryRun && summary.samples.length > 0) {
      console.log('\nFirst records that would be stored:\n');
      summary.samples.forEach(printSample);
    }
    printSummary(summary, repository);
    if (summary.errorCount > 0) exitCode = 1;
  } catch (err) {
    console.error(`✗ Harvest failed: ${err.message}`);
    exitCode = 1;
  } finally {
    if (mongoose) {
      try {
        await mongoose.disconnect();
        console.log('Database connection closed.');
      } catch (err) {
        console.error(`✗ Could not close the database connection cleanly: ${err.message}`);
        exitCode = 1;
      }
    }
  }

  return exitCode;
}

if (require.main === module) {
  loadEnvironment();
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(`✗ Unexpected error: ${err && err.stack ? err.stack : err}`);
      process.exitCode = 1;
    }
  );
}

module.exports = { parseArgs, main };

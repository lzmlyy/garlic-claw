#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const COMMAND_CONFIG = {
  'refactor-metrics': 'metrics.config.json',
  'exports-guard': 'exports-guard.config.json',
  'forbidden-imports': 'forbidden-imports.config.json',
  'consumer-check': 'consumer-check.config.json',
  'module-allowlists': 'module-allowlists.config.json',
  'ws-contract': 'ws-contract.config.json',
  'zero-legacy-refs': 'zero-legacy-refs.config.json',
};

function parseArgs(argv) {
  const values = {
    positionals: [],
    flags: {},
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      values.positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      values.flags[key] = true;
      continue;
    }

    values.flags[key] = next;
    index += 1;
  }

  return values;
}

function resolveWorkspace(workspaceArg) {
  if (!workspaceArg) {
    return REPO_ROOT;
  }
  return path.resolve(workspaceArg);
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function resolveWorkspacePath(workspaceRoot, relativePath) {
  return path.resolve(workspaceRoot, ...relativePath.split('/'));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function ensureDirectory(directoryPath) {
  return fs.existsSync(directoryPath) && fs.statSync(directoryPath).isDirectory();
}

function walkFiles(directoryPath) {
  if (!ensureDirectory(directoryPath)) {
    return [];
  }

  const collected = [];
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      collected.push(...walkFiles(nextPath));
      continue;
    }
    if (entry.isFile()) {
      collected.push(nextPath);
    }
  }
  return collected;
}

function collectCodeFiles(workspaceRoot, roots, extensions, excludeSuffixes) {
  const extensionSet = new Set(extensions);
  const results = [];

  for (const root of roots) {
    const absoluteRoot = resolveWorkspacePath(workspaceRoot, root);
    const files = walkFiles(absoluteRoot);
    for (const filePath of files) {
      const extension = path.extname(filePath);
      const normalized = toPosix(path.relative(workspaceRoot, filePath));
      if (!extensionSet.has(extension)) {
        continue;
      }
      if (excludeSuffixes.some((suffix) => normalized.endsWith(suffix))) {
        continue;
      }
      results.push({
        absolutePath: filePath,
        relativePath: normalized,
      });
    }
  }

  return results;
}

function countLines(text) {
  if (text.length === 0) {
    return 0;
  }

  const lines = text.split(/\r?\n/);
  if (text.endsWith('\n') || text.endsWith('\r')) {
    return lines.length - 1;
  }
  return lines.length;
}

function extractModuleSpecifiers(text) {
  const specifiers = [];
  const importPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"`]*?\s+from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match = importPattern.exec(text);
  while (match) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) {
      specifiers.push(specifier);
    }
    match = importPattern.exec(text);
  }
  return specifiers;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatchingDelimiter(text, startIndex, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let stringQuote = '';

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];

    if (inString) {
      if (char === stringQuote && previous !== '\\') {
        inString = false;
        stringQuote = '';
      }
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractPropertyArrayIdentifiers(text, propertyName) {
  const propertyPattern = new RegExp(`${escapeRegExp(propertyName)}\\s*:\\s*\\[`);
  const match = propertyPattern.exec(text);
  if (!match) {
    return null;
  }

  const arrayStart = text.indexOf('[', match.index);
  const arrayEnd = findMatchingDelimiter(text, arrayStart, '[', ']');
  if (arrayStart < 0 || arrayEnd < 0) {
    return null;
  }

  const arrayText = text.slice(arrayStart + 1, arrayEnd);
  const matches = arrayText.match(/\b[A-Z][A-Za-z0-9_]*\b/g) ?? [];
  return [...new Set(matches)];
}

function extractExportInitializer(text, exportName) {
  const exportPattern = new RegExp(`export\\s+const\\s+${escapeRegExp(exportName)}\\s*=\\s*([\\[{])`);
  const match = exportPattern.exec(text);
  if (!match) {
    return null;
  }

  const openChar = match[1];
  const closeChar = openChar === '{' ? '}' : ']';
  const startIndex = text.indexOf(openChar, match.index);
  const endIndex = findMatchingDelimiter(text, startIndex, openChar, closeChar);
  if (startIndex < 0 || endIndex < 0) {
    return null;
  }

  return text.slice(startIndex, endIndex + 1);
}

function parseLiteralExpression(expression) {
  return Function(`"use strict"; return (${expression});`)();
}

function scanModuleRefCalls(text) {
  const usages = [];
  const pattern = /moduleRef\??\.(get|resolve|create)\s*(?:<[\s\S]*?>)?\(\s*(['"][^'"]+['"]|[A-Za-z_$][A-Za-z0-9_$]*)/g;
  let match = pattern.exec(text);
  while (match) {
    const method = match[1];
    const tokenRaw = match[2];
    const isStringToken = tokenRaw.startsWith('\'') || tokenRaw.startsWith('"');
    usages.push({
      method,
      token: isStringToken ? tokenRaw.slice(1, -1) : tokenRaw,
      tokenRaw,
      isStringToken,
    });
    match = pattern.exec(text);
  }
  return usages;
}

function collectImports(workspaceRoot, roots, extensions, excludeSuffixes) {
  const files = collectCodeFiles(workspaceRoot, roots, extensions, excludeSuffixes);
  return files.flatMap(({ absolutePath, relativePath }) => {
    const text = fs.readFileSync(absolutePath, 'utf8');
    return extractModuleSpecifiers(text).map((specifier) => ({
      file: relativePath,
      specifier,
    }));
  });
}

function classifySharedSpecifier(specifier) {
  if (specifier === '@garlic-claw/shared') {
    return 'root';
  }
  if (specifier.startsWith('@garlic-claw/shared/')) {
    if (specifier.includes('/src/')) {
      return 'source-path';
    }
    return 'subpath';
  }
  if (specifier.includes('shared/src')) {
    return 'source-path';
  }
  return null;
}

function loadCommandConfig(command, workspaceRoot) {
  const configName = COMMAND_CONFIG[command];
  if (!configName) {
    return null;
  }

  const workspaceConfigPath = workspaceRoot
    ? path.join(workspaceRoot, 'tools', 'refactor', 'config', configName)
    : null;
  if (workspaceConfigPath && exists(workspaceConfigPath)) {
    return readJson(workspaceConfigPath);
  }

  const bundledConfigPath = path.join(__dirname, 'config', configName);
  if (!exists(bundledConfigPath)) {
    return null;
  }
  return readJson(bundledConfigPath);
}

function reportAndExit(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.status === 'pass' ? 0 : 1);
}

function fail(command, workspaceRoot, message, details = {}) {
  return {
    command,
    status: 'fail',
    workspace: toPosix(workspaceRoot),
    message,
    ...details,
  };
}

function pass(command, workspaceRoot, details = {}) {
  return {
    command,
    status: 'pass',
    workspace: toPosix(workspaceRoot),
    ...details,
  };
}

function runRefactorMetrics(workspaceRoot, config) {
  const packages = {};
  const packageErrors = [];
  const allFiles = [];

  for (const packageConfig of config.packages) {
    const absoluteRoot = resolveWorkspacePath(workspaceRoot, packageConfig.root);
    if (!ensureDirectory(absoluteRoot)) {
      packageErrors.push({
        package: packageConfig.name,
        missingRoot: packageConfig.root,
      });
      continue;
    }

    const files = collectCodeFiles(
      workspaceRoot,
      [packageConfig.root],
      packageConfig.extensions,
      packageConfig.excludeSuffixes ?? [],
    );
    const summarized = files.map(({ absolutePath, relativePath }) => {
      const text = fs.readFileSync(absolutePath, 'utf8');
      return {
        path: relativePath,
        lines: countLines(text),
      };
    });
    summarized.sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path));
    allFiles.push(...summarized);

    packages[packageConfig.name] = {
      totalLines: summarized.reduce((sum, entry) => sum + entry.lines, 0),
      fileCount: summarized.length,
      topFiles: summarized.slice(0, packageConfig.topFileCount ?? 5),
    };
  }

  if (packageErrors.length > 0) {
    return fail('refactor-metrics', workspaceRoot, 'Missing metric roots', {
      errors: packageErrors,
    });
  }

  const sharedImports = collectImports(
    workspaceRoot,
    config.sharedImportRoots,
    config.importExtensions,
    config.importExcludeSuffixes ?? [],
  )
    .map((entry) => ({
      ...entry,
      classification: classifySharedSpecifier(entry.specifier),
    }))
    .filter((entry) => entry.classification !== null);

  const classCounts = {};
  const specifierCounts = {};
  for (const entry of sharedImports) {
    classCounts[entry.classification] = (classCounts[entry.classification] ?? 0) + 1;
    specifierCounts[entry.specifier] = (specifierCounts[entry.specifier] ?? 0) + 1;
  }

  const topSpecifiers = Object.entries(specifierCounts)
    .map(([specifier, count]) => ({ specifier, count }))
    .sort((left, right) => right.count - left.count || left.specifier.localeCompare(right.specifier));

  const breakdowns = {};
  for (const breakdownConfig of config.breakdowns ?? []) {
    const files = collectCodeFiles(
      workspaceRoot,
      [breakdownConfig.root],
      breakdownConfig.extensions,
      breakdownConfig.excludeSuffixes ?? [],
    );
    const totals = {};
    for (const file of files) {
      const text = fs.readFileSync(file.absolutePath, 'utf8');
      const lineCount = countLines(text);
      const relativeToBreakdownRoot = toPosix(
        path.relative(resolveWorkspacePath(workspaceRoot, breakdownConfig.root), file.absolutePath),
      );
      const [groupName] = relativeToBreakdownRoot.split('/');
      const bucket = groupName || '.';
      totals[bucket] = (totals[bucket] ?? 0) + lineCount;
    }

    const rankedTotals = Object.entries(totals)
      .map(([name, totalLines]) => ({ name, totalLines }))
      .sort((left, right) => right.totalLines - left.totalLines || left.name.localeCompare(right.name));
    breakdowns[breakdownConfig.name] = rankedTotals;
  }

  return pass('refactor-metrics', workspaceRoot, {
    packages,
    globalTopFiles: allFiles
      .slice()
      .sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path))
      .slice(0, config.globalTopFileCount ?? 12),
    breakdowns,
    imports: {
      shared: {
        classCounts,
        topSpecifiers,
      },
    },
  });
}

function runExportsGuard(workspaceRoot, config, scope) {
  if (!scope) {
    return fail('exports-guard', workspaceRoot, 'Missing required --scope argument');
  }

  const scopeConfig = config.scopes?.[scope];
  if (!scopeConfig) {
    return fail('exports-guard', workspaceRoot, `Unknown scope: ${scope}`);
  }

  const packageJsonPath = resolveWorkspacePath(workspaceRoot, scopeConfig.packageFile);
  if (!exists(packageJsonPath)) {
    return fail('exports-guard', workspaceRoot, 'Package file not found', {
      packageFile: scopeConfig.packageFile,
    });
  }

  const packageJson = readJson(packageJsonPath);
  const violations = [];

  for (const [field, expectedValue] of Object.entries(scopeConfig.packageFields ?? {})) {
    if (packageJson[field] !== expectedValue) {
      violations.push({
        kind: 'package-field',
        field,
        expected: expectedValue,
        actual: packageJson[field] ?? null,
      });
    }
  }

  if (!packageJson.exports || typeof packageJson.exports !== 'object' || Array.isArray(packageJson.exports)) {
    violations.push({
      kind: 'exports',
      message: 'package.json must define an exports object',
    });
  } else {
    const actualKeys = Object.keys(packageJson.exports).sort();
    const expectedKeys = Object.keys(scopeConfig.allowlist).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      violations.push({
        kind: 'exports-keys',
        expected: expectedKeys,
        actual: actualKeys,
      });
    }

    for (const [exportKey, expectedTarget] of Object.entries(scopeConfig.allowlist)) {
      const actualTarget = packageJson.exports[exportKey];
      if (!actualTarget || typeof actualTarget !== 'object' || Array.isArray(actualTarget)) {
        violations.push({
          kind: 'export-target',
          exportKey,
          expected: expectedTarget,
          actual: actualTarget ?? null,
        });
        continue;
      }

      for (const [field, expectedValue] of Object.entries(expectedTarget)) {
        if (actualTarget[field] !== expectedValue) {
          violations.push({
            kind: 'export-field',
            exportKey,
            field,
            expected: expectedValue,
            actual: actualTarget[field] ?? null,
          });
        }
      }
    }
  }

  if (violations.length > 0) {
    return fail('exports-guard', workspaceRoot, `Export allowlist violations for scope ${scope}`, {
      scope,
      violations,
    });
  }

  return pass('exports-guard', workspaceRoot, {
    scope,
    packageFile: scopeConfig.packageFile,
    exports: packageJson.exports,
  });
}

function runForbiddenImports(workspaceRoot, config, scope) {
  if (!scope) {
    return fail('forbidden-imports', workspaceRoot, 'Missing required --scope argument');
  }

  const scopeConfig = config.scopes?.[scope];
  if (!scopeConfig) {
    return fail('forbidden-imports', workspaceRoot, `Unknown scope: ${scope}`);
  }

  const imports = collectImports(
    workspaceRoot,
    scopeConfig.scanRoots,
    scopeConfig.extensions,
    scopeConfig.excludeSuffixes ?? [],
  );
  const violations = [];

  for (const entry of imports) {
    for (const rule of scopeConfig.specifierRules) {
      const matchesFilePrefix = !Array.isArray(rule.filePrefixes)
        || rule.filePrefixes.some((prefix) => entry.file.startsWith(prefix));
      if (!matchesFilePrefix) {
        continue;
      }

      const matchesPrefix = rule.prefix && entry.specifier.startsWith(rule.prefix);
      const matchesNeedle = rule.contains && entry.specifier.includes(rule.contains);
      const matchesExact = rule.equals && entry.specifier === rule.equals;
      if (matchesPrefix || matchesNeedle || matchesExact) {
        violations.push({
          kind: 'import',
          file: entry.file,
          specifier: entry.specifier,
          reason: rule.reason,
        });
      }
    }
  }

  for (const tsconfigFile of scopeConfig.tsconfigFiles ?? []) {
    const absoluteTsconfigPath = resolveWorkspacePath(workspaceRoot, tsconfigFile);
    if (!exists(absoluteTsconfigPath)) {
      continue;
    }

    const tsconfigJson = readJson(absoluteTsconfigPath);
    const pathMap = tsconfigJson.compilerOptions?.paths ?? {};
    for (const [alias, targets] of Object.entries(pathMap)) {
      if (!scopeConfig.aliasKeys.includes(alias)) {
        continue;
      }

      for (const target of targets) {
        if (scopeConfig.forbiddenTargetContains.some((needle) => target.includes(needle))) {
          violations.push({
            kind: 'tsconfig-path',
            file: tsconfigFile,
            alias,
            target,
            reason: 'tsconfig path alias points at shared source files',
          });
        }
      }
    }
  }

  if (violations.length > 0) {
    return fail('forbidden-imports', workspaceRoot, `Forbidden import violations for scope ${scope}`, {
      scope,
      violations,
    });
  }

  return pass('forbidden-imports', workspaceRoot, {
    scope,
    scannedRoots: scopeConfig.scanRoots,
  });
}

function runConsumerCheck(workspaceRoot, config, scope) {
  if (!scope) {
    return fail('consumer-check', workspaceRoot, 'Missing required --scope argument');
  }

  const scopeConfig = config.scopes?.[scope];
  if (!scopeConfig) {
    return fail('consumer-check', workspaceRoot, `Unknown scope: ${scope}`);
  }

  const consumers = [];
  const violations = [];

  for (const consumer of scopeConfig.consumers) {
    const absoluteRoot = resolveWorkspacePath(workspaceRoot, consumer.root);
    if (!ensureDirectory(absoluteRoot)) {
      violations.push({
        kind: 'consumer-root',
        consumer: consumer.name,
        root: consumer.root,
      });
      continue;
    }

    const imports = collectImports(
      workspaceRoot,
      [consumer.root],
      scopeConfig.extensions,
      scopeConfig.excludeSuffixes ?? [],
    ).filter((entry) => {
      if (entry.specifier === scopeConfig.packageName) {
        return true;
      }
      return entry.specifier.startsWith(`${scopeConfig.packageName}/`);
    });

    if (imports.length === 0) {
      violations.push({
        kind: 'missing-consumer-imports',
        consumer: consumer.name,
        root: consumer.root,
      });
      continue;
    }

    const invalidImports = imports.filter(
      (entry) => !scopeConfig.allowedSpecifiers.includes(entry.specifier),
    );
    if (invalidImports.length > 0) {
      violations.push(
        ...invalidImports.map((entry) => ({
          kind: 'consumer-import',
          consumer: consumer.name,
          file: entry.file,
          specifier: entry.specifier,
        })),
      );
    }

    consumers.push({
      name: consumer.name,
      root: consumer.root,
      importCount: imports.length,
      specifiers: [...new Set(imports.map((entry) => entry.specifier))].sort(),
    });
  }

  if (violations.length > 0) {
    return fail('consumer-check', workspaceRoot, `Consumer surface violations for scope ${scope}`, {
      scope,
      violations,
      consumers,
    });
  }

  return pass('consumer-check', workspaceRoot, {
    scope,
    consumers,
  });
}

function runPendingScopedCommand(command, workspaceRoot, config, scope) {
  if (!scope && command !== 'ws-contract') {
    return fail(command, workspaceRoot, 'Missing required --scope argument');
  }

  if (scope && !config.scopes?.[scope]) {
    return fail(command, workspaceRoot, `Unknown scope: ${scope}`);
  }

  return fail(command, workspaceRoot, `${command} is not implemented for this stage yet`, {
    scope: scope ?? null,
  });
}

function runZeroLegacyRefs(workspaceRoot, config, scope) {
  if (!scope) {
    return fail('zero-legacy-refs', workspaceRoot, 'Missing required --scope argument');
  }

  const scopeConfig = config.scopes?.[scope];
  if (!scopeConfig) {
    return fail('zero-legacy-refs', workspaceRoot, `Unknown scope: ${scope}`);
  }

  const violations = [];
  for (const relativePath of scopeConfig.forbiddenPaths ?? []) {
    const absolutePath = resolveWorkspacePath(workspaceRoot, relativePath);
    if (exists(absolutePath)) {
      violations.push({
        kind: 'path',
        path: relativePath,
      });
    }
  }

  for (const entry of scopeConfig.forbiddenTextMatches ?? []) {
    const absolutePath = resolveWorkspacePath(workspaceRoot, entry.file);
    if (!exists(absolutePath)) {
      violations.push({
        kind: 'missing-file',
        file: entry.file,
      });
      continue;
    }
    const text = fs.readFileSync(absolutePath, 'utf8');
    for (const needle of entry.needles ?? []) {
      if (text.includes(needle)) {
        violations.push({
          kind: 'text-match',
          file: entry.file,
          needle,
        });
      }
    }
  }

  const indexFile = scopeConfig.indexFile
    ? resolveWorkspacePath(workspaceRoot, scopeConfig.indexFile)
    : null;
  if (indexFile && exists(indexFile)) {
    const text = fs.readFileSync(indexFile, 'utf8');
    for (const needle of scopeConfig.forbiddenExportSubstrings ?? []) {
      if (text.includes(needle)) {
        violations.push({
          kind: 'index-export',
          file: scopeConfig.indexFile,
          needle,
        });
      }
    }
  }

  if (violations.length > 0) {
    return fail('zero-legacy-refs', workspaceRoot, `Legacy references still exist for scope ${scope}`, {
      scope,
      violations,
    });
  }

  return pass('zero-legacy-refs', workspaceRoot, {
    scope,
    checkedPaths: scopeConfig.forbiddenPaths ?? [],
    checkedTextFiles: (scopeConfig.forbiddenTextMatches ?? []).map((entry) => entry.file),
    checkedIndexFile: scopeConfig.indexFile ?? null,
  });
}

function runModuleAllowlists(workspaceRoot, config, scope) {
  if (!scope) {
    return fail('module-allowlists', workspaceRoot, 'Missing required --scope argument');
  }

  const scopeConfig = config.scopes?.[scope];
  if (!scopeConfig) {
    return fail('module-allowlists', workspaceRoot, `Unknown scope: ${scope}`);
  }

  const violations = [];
  let boundaryScope = null;
  let boundaryOwnerFiles = new Set();
  if (scopeConfig.boundaryMapFile) {
    const boundaryMapPath = resolveWorkspacePath(workspaceRoot, scopeConfig.boundaryMapFile);
    if (!exists(boundaryMapPath)) {
      return fail('module-allowlists', workspaceRoot, 'Boundary map file not found', {
        scope,
        boundaryMapFile: scopeConfig.boundaryMapFile,
      });
    }

    const boundaryMap = readJson(boundaryMapPath);
    boundaryScope = boundaryMap[scopeConfig.boundaryMapScope ?? scope];
    if (!boundaryScope) {
      return fail('module-allowlists', workspaceRoot, 'Boundary map scope not found', {
        scope,
        boundaryMapFile: scopeConfig.boundaryMapFile,
        boundaryMapScope: scopeConfig.boundaryMapScope ?? scope,
      });
    }

    for (const [owner, files] of Object.entries(boundaryScope.owners ?? {})) {
      for (const relativePath of files) {
        boundaryOwnerFiles.add(relativePath);
        if (!exists(resolveWorkspacePath(workspaceRoot, relativePath))) {
          violations.push({
            kind: 'boundary-map-path',
            owner,
            path: relativePath,
          });
        }
      }
    }

    for (const entry of boundaryScope.moduleRefAllowlist ?? []) {
      if (!exists(resolveWorkspacePath(workspaceRoot, entry.file))) {
        violations.push({
          kind: 'boundary-map-module-ref',
          file: entry.file,
        });
      }
    }
  }

  const moduleConfigs = Array.isArray(scopeConfig.moduleFiles) && scopeConfig.moduleFiles.length > 0
    ? scopeConfig.moduleFiles
    : [{
      file: scopeConfig.moduleFile,
      allowedImports: scopeConfig.allowedImports ?? [],
      allowedExports: scopeConfig.allowedExports ?? [],
    }];
  const moduleReports = [];

  for (const moduleConfig of moduleConfigs) {
    const moduleFile = resolveWorkspacePath(workspaceRoot, moduleConfig.file);
    if (!exists(moduleFile)) {
      return fail('module-allowlists', workspaceRoot, 'Module file not found', {
        scope,
        moduleFile: moduleConfig.file,
      });
    }

    const moduleText = fs.readFileSync(moduleFile, 'utf8');
    const actualImports = extractPropertyArrayIdentifiers(moduleText, 'imports') ?? [];
    const actualExports = extractPropertyArrayIdentifiers(moduleText, 'exports') ?? [];
    const expectedImports = moduleConfig.allowedImports ?? [];
    const expectedExports = moduleConfig.allowedExports ?? [];

    for (const token of actualImports) {
      if (!expectedImports.includes(token)) {
        violations.push({
          kind: 'module-import',
          file: moduleConfig.file,
          token,
        });
      }
    }
    for (const token of expectedImports) {
      if (!actualImports.includes(token)) {
        violations.push({
          kind: 'missing-module-import',
          file: moduleConfig.file,
          token,
        });
      }
    }
    for (const token of actualExports) {
      if (!expectedExports.includes(token)) {
        violations.push({
          kind: 'module-export',
          file: moduleConfig.file,
          token,
        });
      }
    }
    for (const token of expectedExports) {
      if (!actualExports.includes(token)) {
        violations.push({
          kind: 'missing-module-export',
          file: moduleConfig.file,
          token,
        });
      }
    }

    moduleReports.push({
      file: moduleConfig.file,
      actualImports,
      actualExports,
    });
  }

  const allowlistEntries = boundaryScope?.moduleRefAllowlist
    ?? scopeConfig.moduleRefAllowlist
    ?? [];
  const allowedByFile = new Map(
    allowlistEntries.map((entry) => [entry.file, new Set(entry.tokens ?? [])]),
  );

  if (boundaryOwnerFiles.size > 0) {
    const ownedFiles = collectCodeFiles(
      workspaceRoot,
      scopeConfig.scanRoots ?? [],
      scopeConfig.extensions ?? ['.ts'],
      scopeConfig.excludeSuffixes ?? [],
    );
    for (const { relativePath } of ownedFiles) {
      if (!boundaryOwnerFiles.has(relativePath)) {
        violations.push({
          kind: 'boundary-map-unowned-file',
          file: relativePath,
        });
      }
    }
  }

  const scannedFiles = new Set();
  for (const scanRoot of scopeConfig.scanRoots ?? []) {
    const files = collectCodeFiles(
      workspaceRoot,
      [scanRoot],
      scopeConfig.extensions ?? ['.ts'],
      scopeConfig.excludeSuffixes ?? [],
    );
    for (const { absolutePath, relativePath } of files) {
      const text = fs.readFileSync(absolutePath, 'utf8');
      const usages = scanModuleRefCalls(text);
      if (usages.length === 0) {
        continue;
      }

      scannedFiles.add(relativePath);
      const allowedTokens = allowedByFile.get(relativePath);
      if (!allowedTokens) {
        violations.push({
          kind: 'module-ref-file',
          file: relativePath,
          tokenCount: usages.length,
        });
        continue;
      }

      for (const usage of usages) {
        if (usage.isStringToken) {
          violations.push({
            kind: 'module-ref-string-token',
            file: relativePath,
            method: usage.method,
            token: usage.token,
          });
          continue;
        }
        if (!allowedTokens.has(usage.token)) {
          violations.push({
            kind: 'module-ref-token',
            file: relativePath,
            method: usage.method,
            token: usage.token,
          });
        }
      }
    }
  }

  for (const entry of allowlistEntries) {
    const absolutePath = resolveWorkspacePath(workspaceRoot, entry.file);
    if (!exists(absolutePath)) {
      continue;
    }

    const text = fs.readFileSync(absolutePath, 'utf8');
    const usages = scanModuleRefCalls(text);
    if (usages.length === 0) {
      continue;
    }

    if (scannedFiles.has(entry.file)) {
      continue;
    }

    const allowedTokens = new Set(entry.tokens ?? []);
    for (const usage of usages) {
      if (usage.isStringToken) {
        violations.push({
          kind: 'module-ref-string-token',
          file: entry.file,
          method: usage.method,
          token: usage.token,
        });
        continue;
      }
      if (!allowedTokens.has(usage.token)) {
        violations.push({
          kind: 'module-ref-token',
          file: entry.file,
          method: usage.method,
          token: usage.token,
        });
      }
    }
  }

  if (violations.length > 0) {
    return fail('module-allowlists', workspaceRoot, `Module allowlist violations for scope ${scope}`, {
      scope,
      violations,
      moduleFiles: moduleReports,
    });
  }

  const primaryModule = moduleReports[0] ?? null;
  return pass('module-allowlists', workspaceRoot, {
    scope,
    moduleFile: primaryModule?.file ?? null,
    actualImports: primaryModule?.actualImports ?? [],
    actualExports: primaryModule?.actualExports ?? [],
    moduleFiles: moduleReports,
    checkedModuleRefFiles: allowlistEntries
      .map((entry) => entry.file)
      .filter((relativePath) => exists(resolveWorkspacePath(workspaceRoot, relativePath))),
  });
}

function runWsContract(workspaceRoot, config, scope) {
  const resolvedScope = scope
    ?? (Object.keys(config.scopes ?? {}).length === 1 ? Object.keys(config.scopes ?? {})[0] : null);
  if (!resolvedScope) {
    return fail('ws-contract', workspaceRoot, 'Missing required --scope argument');
  }

  const scopeConfig = config.scopes?.[resolvedScope];
  if (!scopeConfig) {
    return fail('ws-contract', workspaceRoot, `Unknown scope: ${resolvedScope}`);
  }

  const violations = [];
  for (const assertion of scopeConfig.valueAssertions ?? []) {
    const absolutePath = resolveWorkspacePath(workspaceRoot, assertion.file);
    if (!exists(absolutePath)) {
      violations.push({
        kind: 'missing-file',
        file: assertion.file,
      });
      continue;
    }

    const text = fs.readFileSync(absolutePath, 'utf8');
    const initializer = extractExportInitializer(text, assertion.exportName);
    if (!initializer) {
      violations.push({
        kind: 'missing-export',
        file: assertion.file,
        exportName: assertion.exportName,
      });
      continue;
    }

    const actualValue = parseLiteralExpression(initializer);
    if (JSON.stringify(actualValue) !== JSON.stringify(assertion.expected)) {
      violations.push({
        kind: 'contract-value',
        file: assertion.file,
        exportName: assertion.exportName,
        expected: assertion.expected,
        actual: actualValue,
      });
    }
  }

  for (const entry of scopeConfig.requiredSubstrings ?? []) {
    const absolutePath = resolveWorkspacePath(workspaceRoot, entry.file);
    if (!exists(absolutePath)) {
      violations.push({
        kind: 'missing-file',
        file: entry.file,
      });
      continue;
    }

    const text = fs.readFileSync(absolutePath, 'utf8');
    for (const pattern of entry.patterns ?? []) {
      if (!includesRequiredContractPattern(text, pattern)) {
        violations.push({
          kind: 'required-substring',
          file: entry.file,
          pattern,
        });
      }
    }
  }

  if (violations.length > 0) {
    return fail('ws-contract', workspaceRoot, `WebSocket contract violations for scope ${resolvedScope}`, {
      scope: resolvedScope,
      violations,
    });
  }

  return pass('ws-contract', workspaceRoot, {
    scope: resolvedScope,
    checkedFiles: [
      ...(scopeConfig.valueAssertions ?? []).map((entry) => entry.file),
      ...(scopeConfig.requiredSubstrings ?? []).map((entry) => entry.file),
    ],
  });
}

function includesRequiredContractPattern(text, pattern) {
  const uncommented = stripLineComments(text);
  return uncommented
    .split(/\r?\n/)
    .filter((line) => !/\b(?:it|test|describe)\.skip\s*\(/.test(line))
    .some((line) => line.includes(pattern));
}

function stripLineComments(text) {
  let output = '';
  let inBlockComment = false;
  for (const line of text.split(/\r?\n/)) {
    let nextLine = '';
    for (let index = 0; index < line.length; index += 1) {
      const pair = line.slice(index, index + 2);
      if (!inBlockComment && pair === '/*') {
        inBlockComment = true;
        index += 1;
        continue;
      }
      if (inBlockComment && pair === '*/') {
        inBlockComment = false;
        index += 1;
        continue;
      }
      if (!inBlockComment && pair === '//') {
        break;
      }
      if (!inBlockComment) {
        nextLine += line[index];
      }
    }
    output += `${nextLine}\n`;
  }
  return output;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positionals[0];
  if (!command) {
    reportAndExit(fail('unknown', REPO_ROOT, 'Missing command name'));
    return;
  }

  const workspaceRoot = resolveWorkspace(args.flags.workspace);
  const config = loadCommandConfig(command, workspaceRoot);
  if (!config) {
    reportAndExit(fail(command, workspaceRoot, 'Command config file not found'));
    return;
  }

  let report;
  if (command === 'refactor-metrics') {
    report = runRefactorMetrics(workspaceRoot, config);
  } else if (command === 'exports-guard') {
    report = runExportsGuard(workspaceRoot, config, args.flags.scope);
  } else if (command === 'forbidden-imports') {
    report = runForbiddenImports(workspaceRoot, config, args.flags.scope);
  } else if (command === 'consumer-check') {
    report = runConsumerCheck(workspaceRoot, config, args.flags.scope);
  } else if (command === 'module-allowlists') {
    report = runModuleAllowlists(workspaceRoot, config, args.flags.scope);
  } else if (command === 'ws-contract') {
    report = runWsContract(workspaceRoot, config, args.flags.scope);
  } else if (command === 'zero-legacy-refs') {
    report = runZeroLegacyRefs(workspaceRoot, config, args.flags.scope);
  } else {
    report = runPendingScopedCommand(command, workspaceRoot, config, args.flags.scope);
  }

  reportAndExit(report);
}

main();

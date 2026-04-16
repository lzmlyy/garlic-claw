const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const SERVER_HTTP_ROOT = path.join('packages', 'server', 'src', 'adapters', 'http');
const WEB_HTTP_ROOT = path.join('packages', 'web', 'src');
const SERVER_DECORATOR_METHODS = {
  All: 'ALL',
  Delete: 'DELETE',
  Get: 'GET',
  Patch: 'PATCH',
  Post: 'POST',
  Put: 'PUT',
};
const WEB_HTTP_METHODS = {
  del: 'DELETE',
  delete: 'DELETE',
  get: 'GET',
  patch: 'PATCH',
  post: 'POST',
  put: 'PUT',
};

function collectServerHttpRoutes(projectRoot) {
  const root = path.join(projectRoot, SERVER_HTTP_ROOT);
  const files = listFiles(root, (filePath) => filePath.endsWith('.controller.ts'));
  const routes = [];

  for (const filePath of files) {
    const sourceFile = readSourceFile(filePath);
    for (const statement of sourceFile.statements) {
      if (!ts.isClassDeclaration(statement)) {
        continue;
      }

      const controllerDecorator = findDecorator(statement, 'Controller');
      if (!controllerDecorator) {
        continue;
      }

      const controllerPath = readDecoratorPath(controllerDecorator, sourceFile);
      for (const member of statement.members) {
        if (!ts.isMethodDeclaration(member)) {
          continue;
        }

        for (const decorator of getDecorators(member)) {
          const decoratorName = readDecoratorName(decorator);
          const method = SERVER_DECORATOR_METHODS[decoratorName];
          if (!method) {
            continue;
          }

          const handlerPath = readDecoratorPath(decorator, sourceFile);
          routes.push({
            filePath: toProjectRelativePath(projectRoot, filePath),
            method,
            path: withApiPrefix(joinPaths(controllerPath, handlerPath)),
          });
        }
      }
    }
  }

  return sortRoutes(uniqueRoutes(routes));
}

function collectWebHttpRoutes(projectRoot) {
  const apiFiles = [
    ...listFiles(path.join(projectRoot, WEB_HTTP_ROOT, 'features'), (filePath) => filePath.endsWith('.ts') && filePath.includes(`${path.sep}api${path.sep}`)),
    path.join(projectRoot, WEB_HTTP_ROOT, 'api', 'http.ts'),
  ].filter((filePath) => fs.existsSync(filePath));
  const routes = [];

  for (const filePath of apiFiles) {
    const sourceFile = readSourceFile(filePath);
    const localHelperMethods = collectLocalHelperMethods(sourceFile);
    const httpHelperNames = collectHttpHelperNames(sourceFile);
    walkNode(sourceFile, (node) => {
      if (!ts.isCallExpression(node)) {
        return;
      }

      if (!ts.isIdentifier(node.expression)) {
        return;
      }

      const calleeName = node.expression.text;
      if (!calleeName) {
        return;
      }
      if (!httpHelperNames.has(calleeName) && !localHelperMethods.has(calleeName)) {
        return;
      }

      const routePath = readRoutePathExpression(node.arguments[0], sourceFile);
      if (!routePath) {
        return;
      }

      const method = readWebCallMethod(node, calleeName, localHelperMethods, sourceFile);
      if (!method) {
        return;
      }

      routes.push({
        filePath: toProjectRelativePath(projectRoot, filePath),
        method,
        path: withApiPrefix(routePath),
      });
    });
  }

  return sortRoutes(uniqueRoutes(routes));
}

function findUnmatchedWebRoutes(serverRoutes, webRoutes) {
  return webRoutes.filter((route) => !findBestMatchingRoute(route, serverRoutes));
}

function findUncoveredServerRoutes(serverRoutes, visitedRoutes) {
  const coveredRouteKeys = new Set(
    visitedRoutes
      .map((route) => findBestMatchingRoute(route, serverRoutes))
      .filter(Boolean)
      .map((route) => `${route.method} ${route.path}`),
  );
  return serverRoutes.filter((serverRoute) => !coveredRouteKeys.has(`${serverRoute.method} ${serverRoute.path}`));
}

function describeRoutes(routes) {
  return routes.map((route) => `${route.method} ${route.path} <${route.filePath}>`);
}

function collectLocalHelperMethods(sourceFile) {
  const methods = new Map();

  walkNode(sourceFile, (node) => {
    if (!ts.isFunctionDeclaration(node) || !node.name || !node.body) {
      return;
    }

    const firstParameter = node.parameters[0];
    if (!firstParameter || !ts.isIdentifier(firstParameter.name)) {
      return;
    }

    let resolvedMethod = null;
    walkNode(node.body, (innerNode) => {
      if (resolvedMethod || !ts.isCallExpression(innerNode)) {
        return;
      }

      const calleeName = readCallName(innerNode.expression);
      if (!calleeName) {
        return;
      }

      const firstArgument = innerNode.arguments[0];
      if (!firstArgument || !ts.isIdentifier(firstArgument) || firstArgument.text !== firstParameter.name.text) {
        return;
      }

      resolvedMethod = readWebCallMethod(innerNode, calleeName, new Map(), sourceFile);
    });

    if (resolvedMethod) {
      methods.set(node.name.text, resolvedMethod);
    }
  });

  return methods;
}

function collectHttpHelperNames(sourceFile) {
  const helpers = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause?.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) {
      continue;
    }

    if (statement.moduleSpecifier.text !== '@/api/http') {
      continue;
    }

    for (const element of statement.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName in WEB_HTTP_METHODS || importedName === 'request' || importedName === 'requestRaw' || importedName === 'requestWithMetadata') {
        helpers.add(element.name.text);
      }
    }
  }

  if (path.basename(sourceFile.fileName) === 'http.ts') {
    helpers.add('request');
    helpers.add('requestRaw');
    helpers.add('requestWithMetadata');
    helpers.add('get');
    helpers.add('post');
    helpers.add('put');
    helpers.add('patch');
    helpers.add('del');
  }

  return helpers;
}

function readWebCallMethod(node, calleeName, localHelperMethods, sourceFile) {
  if (WEB_HTTP_METHODS[calleeName]) {
    return WEB_HTTP_METHODS[calleeName];
  }
  if (localHelperMethods.has(calleeName)) {
    return localHelperMethods.get(calleeName);
  }
  if (calleeName === 'requestWithMetadata') {
    const configuredMethod = readMethodFromOptions(node.arguments[1], sourceFile);
    return configuredMethod ?? 'ALL';
  }
  if (calleeName === 'requestRaw' || calleeName === 'request') {
    return readMethodFromOptions(node.arguments[1], sourceFile);
  }
  return null;
}

function findBestMatchingRoute(candidateRoute, routes) {
  let bestMatch = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const route of routes) {
    const score = getRouteMatchScore(candidateRoute, route);
    if (score === null || score < bestScore) {
      continue;
    }
    if (score > bestScore) {
      bestMatch = route;
      bestScore = score;
    }
  }

  return bestMatch;
}

function readMethodFromOptions(argument, sourceFile) {
  if (!argument || !ts.isObjectLiteralExpression(argument)) {
    return null;
  }

  for (const property of argument.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const propertyName = readPropertyName(property.name);
    if (propertyName !== 'method') {
      continue;
    }
    return readStringLikeText(property.initializer, sourceFile)?.toUpperCase() ?? null;
  }

  return null;
}

function routesMatch(actualRoute, expectedRoute) {
  return getRouteMatchScore(actualRoute, expectedRoute) !== null;
}

function getRouteMatchScore(candidateRoute, expectedRoute) {
  const methodScore = getMethodMatchScore(candidateRoute.method, expectedRoute.method);
  if (methodScore === null) {
    return null;
  }

  const pathScore = getPathMatchScore(candidateRoute.path, expectedRoute.path);
  if (pathScore === null) {
    return null;
  }

  return methodScore + pathScore;
}

function getMethodMatchScore(candidateMethod, expectedMethod) {
  if (candidateMethod === expectedMethod) {
    return 10;
  }
  if (candidateMethod === 'ALL' || expectedMethod === 'ALL') {
    return 1;
  }
  return null;
}

function getPathMatchScore(candidatePath, expectedPath) {
  const candidateSegments = splitPath(candidatePath);
  const expectedSegments = splitPath(expectedPath);

  let candidateIndex = 0;
  let expectedIndex = 0;
  let score = 0;

  while (candidateIndex < candidateSegments.length && expectedIndex < expectedSegments.length) {
    const candidateSegment = candidateSegments[candidateIndex];
    const expectedSegment = expectedSegments[expectedIndex];

    if (expectedSegment.startsWith('*')) {
      return candidateIndex < candidateSegments.length ? score : null;
    }

    if (expectedSegment.startsWith(':')) {
      if (candidateSegment.startsWith(':')) {
        score += 2;
      } else {
        score += 3;
      }
      candidateIndex += 1;
      expectedIndex += 1;
      continue;
    }

    if (candidateSegment.startsWith(':')) {
      return null;
    }

    if (candidateSegment !== expectedSegment) {
      return null;
    }

    score += 5;
    candidateIndex += 1;
    expectedIndex += 1;
  }

  if (candidateIndex === candidateSegments.length && expectedIndex === expectedSegments.length) {
    return score;
  }

  if (expectedIndex === expectedSegments.length - 1 && expectedSegments[expectedIndex].startsWith('*')) {
    return candidateIndex < candidateSegments.length ? score : null;
  }

  return null;
}

function splitPath(routePath) {
  return normalizeRoutePath(routePath)
    .split('/')
    .filter(Boolean);
}

function withApiPrefix(routePath) {
  const normalized = normalizeRoutePath(routePath);
  if (normalized.startsWith('/api/')) {
    return normalized;
  }
  if (normalized === '/api') {
    return normalized;
  }
  return `/api${normalized}`;
}

function joinPaths(...parts) {
  const normalizedParts = parts
    .map((segment) => normalizeRoutePath(segment))
    .filter((segment) => segment !== '/');
  if (normalizedParts.length === 0) {
    return '/';
  }
  return normalizedParts.join('').replace(/\/+/g, '/') || '/';
}

function normalizeRoutePath(routePath) {
  const trimmed = String(routePath ?? '').trim();
  if (!trimmed) {
    return '/';
  }
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return normalized.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function readDecoratorPath(decorator, sourceFile) {
  const firstArgument = decorator.expression.arguments?.[0];
  return firstArgument ? readRoutePathExpression(firstArgument, sourceFile) ?? '/' : '/';
}

function readRoutePathExpression(expression, sourceFile) {
  if (!expression) {
    return null;
  }

  if (
    !ts.isStringLiteral(expression)
    && !ts.isNoSubstitutionTemplateLiteral(expression)
    && !ts.isTemplateExpression(expression)
  ) {
    return null;
  }

  const raw = readStringLikeText(expression, sourceFile);
  if (typeof raw !== 'string') {
    return null;
  }

  let normalized = raw.replace(/\$\{[^}]+\}/g, ':param');
  if (/(query|search|suffix)/i.test(raw)) {
    normalized = normalized.replace(/:param$/g, '');
  }
  normalized = normalized.replace(/\?.*$/, '');
  normalized = normalized.replace(/\/+/g, '/');

  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  return normalized.replace(/\/$/, '') || '/';
}

function readStringLikeText(expression, sourceFile) {
  if (!expression) {
    return null;
  }
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  return expression
    .getText(sourceFile)
    .replace(/^(['"`])/, '')
    .replace(/(['"`])$/, '');
}

function findDecorator(node, name) {
  return getDecorators(node).find((decorator) => readDecoratorName(decorator) === name);
}

function getDecorators(node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function readDecoratorName(decorator) {
  const expression = decorator.expression;
  if (ts.isCallExpression(expression)) {
    return readCallName(expression.expression);
  }
  return readCallName(expression);
}

function readCallName(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return null;
}

function readPropertyName(nameNode) {
  if (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode)) {
    return nameNode.text;
  }
  return null;
}

function walkNode(node, visitor) {
  visitor(node);
  ts.forEachChild(node, (child) => walkNode(child, visitor));
}

function readSourceFile(filePath) {
  return ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function listFiles(root, predicate) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, predicate));
      continue;
    }
    if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function uniqueRoutes(routes) {
  const seen = new Set();
  return routes.filter((route) => {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sortRoutes(routes) {
  return [...routes].sort((left, right) =>
    left.path === right.path
      ? left.method.localeCompare(right.method)
      : left.path.localeCompare(right.path));
}

function toProjectRelativePath(projectRoot, filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, '/');
}

module.exports = {
  collectServerHttpRoutes,
  collectWebHttpRoutes,
  describeRoutes,
  findUncoveredServerRoutes,
  findUnmatchedWebRoutes,
};

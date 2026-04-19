export function shouldDeleteBrowserSmokeProvider(input) {
  if (input.providerId === input.configuredProviderId) {
    return true;
  }

  if (input.providerId.startsWith(input.smokePrefixRoot)) {
    return true;
  }

  if (input.initialProviderIds.has(input.providerId)) {
    return false;
  }

  return input.providerApiKey === 'test-openai-key';
}

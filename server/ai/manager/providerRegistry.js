// manager/providerRegistry.js
//
// Reads environment variables at module load time and builds the ordered list
// of active providers. Only providers with a valid API key are registered.
// The order here defines the fallback priority.
//
// To add a new provider:
//   1. Create server/ai/providers/<name>.js with { name, isAvailable, generateText }
//   2. Import it here and add it to PROVIDER_DEFINITIONS in the desired position.

import * as geminiProvider    from '../providers/gemini.js';
import * as openrouterProvider from '../providers/openrouter.js';
import * as cohereProvider    from '../providers/cohere.js';
import * as mistralProvider   from '../providers/mistral.js';

// Ordered list — first entry is tried first.
const PROVIDER_DEFINITIONS = [
  geminiProvider,
  openrouterProvider,
  cohereProvider,
  mistralProvider,
];

/**
 * Build and return the active provider registry.
 * Each entry: { name: string, provider: module }
 *
 * Gemini is always included even when its key is missing so the existing error
 * message ("GEMINI_API_KEY is not configured") is preserved for users who have
 * not yet set up any provider. All other providers are opt-in via their key.
 */
function buildRegistry() {
  const registry = [];

  for (const provider of PROVIDER_DEFINITIONS) {
    // Gemini: always include — its own sendGeminiRequest throws a clear error
    // if the key is absent, which is the existing expected behaviour.
    if (provider.name === 'gemini') {
      registry.push({ name: provider.name, provider });
      continue;
    }

    if (provider.isAvailable()) {
      registry.push({ name: provider.name, provider });
      console.log(`[AIRegistry] Registered provider: ${provider.name}`);
    }
  }

  return registry;
}

// Build once at startup.
export const registry = buildRegistry();

/**
 * Return the list of registered providers in fallback order.
 * @returns {Array<{name: string, provider: object}>}
 */
export function getProviders() {
  return registry;
}

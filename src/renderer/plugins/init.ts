/**
 * Plugin initialization — registers all built-in plugins.
 * Called once at app startup.
 */

import { registerPlugin } from './registry';
import crmPlugin from './crm';

export function initializePlugins(): void {
  registerPlugin(crmPlugin);
}

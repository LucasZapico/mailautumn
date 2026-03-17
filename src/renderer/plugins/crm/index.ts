/**
 * CRM Plugin — lightweight contact relationship management.
 * Registers into the 'message-sidebar' slot.
 */

import { registerSlot, type PluginDefinition } from '../registry';
import ContactPanel from './ContactPanel';

const crmPlugin: PluginDefinition = {
  id: 'crm',
  name: 'Contact CRM',
  activate() {
    registerSlot('message-sidebar', {
      pluginId: 'crm',
      component: ContactPanel,
      priority: 10,
    });
  },
};

export default crmPlugin;

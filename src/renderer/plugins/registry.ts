/**
 * Plugin registry — internal slot-based plugin system.
 * Plugins register React components into named slots.
 * Host components render slots via <PluginSlot name="..." />.
 */

import type { ComponentType } from 'react';

export type SlotName =
  | 'message-sidebar'     // Right panel next to message view
  | 'thread-decorator'    // Inline badges in thread list items
  | 'thread-action'       // Extra buttons in thread quick actions
  | 'compose-toolbar'     // Extra buttons in compose toolbar
  | 'sidebar-section';    // Section in the left sidebar

export interface SlotEntry<P = any> {
  pluginId: string;
  component: ComponentType<P>;
  priority?: number; // lower = rendered first
}

const slots = new Map<SlotName, SlotEntry[]>();

export function registerSlot<P>(name: SlotName, entry: SlotEntry<P>): void {
  const list = slots.get(name) || [];
  list.push(entry);
  list.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  slots.set(name, list);
}

export function getSlotEntries(name: SlotName): SlotEntry[] {
  return slots.get(name) || [];
}

/** Plugin definition */
export interface PluginDefinition {
  id: string;
  name: string;
  activate: () => void;
}

const plugins = new Map<string, PluginDefinition>();

export function registerPlugin(plugin: PluginDefinition): void {
  plugins.set(plugin.id, plugin);
  plugin.activate();
}

export function getPlugins(): PluginDefinition[] {
  return [...plugins.values()];
}

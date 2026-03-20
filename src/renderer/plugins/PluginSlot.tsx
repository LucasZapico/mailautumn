import { getSlotEntries, type SlotName } from './registry';

interface PluginSlotProps {
  name: SlotName;
  expanded?: boolean;
  props?: Record<string, any>;
}

export default function PluginSlot({ name, expanded, props = {} }: PluginSlotProps) {
  const entries = getSlotEntries(name);
  if (entries.length === 0) return null;

  return (
    <>
      {entries.map((entry) => {
        const Component = entry.component;
        return <Component key={entry.pluginId} {...props} expanded={expanded} />;
      })}
    </>
  );
}

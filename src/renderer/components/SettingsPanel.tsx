import { useState, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import BoringAvatar from 'boring-avatars';
import {
  IoCloseOutline, IoDesktopOutline, IoColorPaletteOutline,
  IoNotificationsOutline, IoFlashOutline, IoPersonOutline,
  IoAddOutline, IoLogoGoogle, IoTrashOutline, IoCheckmarkCircleOutline,
  IoFolderOpenOutline, IoCopyOutline, IoCheckmarkOutline, IoConstructOutline,
} from 'react-icons/io5';
import {
  viewModeAtom, densityAtom, activeCategoryAtom, setActiveCategoryAtom,
  showLabelsAtom, showViewsAtom, showAvatarsAtom, avatarStyleAtom, newsletterViewAtom,
  accountsAtom, checkAccountsAtom, addingAccountAtom,
  undoSendDelayAtom, setUndoSendDelayAtom, showFormattingToolbarAtom, crmPanelExpandedAtom,
  animationSpeedAtom, afterActionAtom,
} from '../atoms/app';
import type { AvatarStyle, AnimationSpeed, AfterAction } from '../atoms/app';
import {
  themeModeAtom, accentColorAtom, accentSaturationAtom,
  setThemeModeAtom, setAccentColorAtom, setAccentSaturationAtom,
} from '../atoms/theme';
import type { ThemeMode, AccentColor, AccentSaturation } from '../lib/theme';
import type { CategoryTab } from '../data/types';
import type { Density, NewsletterViewMode } from '../atoms/app';

type SettingsTab = 'general' | 'appearance' | 'notifications' | 'ai' | 'accounts' | 'troubleshooting';

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General', icon: IoDesktopOutline },
  { id: 'appearance', label: 'Appearance', icon: IoColorPaletteOutline },
  { id: 'notifications', label: 'Notifications', icon: IoNotificationsOutline },
  { id: 'ai', label: 'AI', icon: IoFlashOutline },
  { id: 'accounts', label: 'Accounts', icon: IoPersonOutline },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: IoConstructOutline },
];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer group">
      <span className="text-sm text-text-primary">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${checked ? 'bg-accent' : 'bg-bg-active'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'left-5' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

function Select({ value, options, onChange, label }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; label: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-text-primary">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="bg-bg-input border border-border-primary rounded-md px-2 py-1 text-sm text-text-primary outline-none cursor-pointer">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

const avatarPalette = ['#4a9eff', '#4caf50', '#ff8c42', '#9c7cff', '#f06292', '#26a69a', '#ffb300'];

function getMonoPreviewPalette(): string[] {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#dc4c3e';
  const r = parseInt(accent.slice(1, 3), 16);
  const g = parseInt(accent.slice(3, 5), 16);
  const b = parseInt(accent.slice(5, 7), 16);
  return [0.3, 0.5, 0.7, 0.85, 1.0].map(mult =>
    `rgb(${Math.round(r * mult)},${Math.round(g * mult)},${Math.round(b * mult)})`
  );
}

function AvatarPreview({ style }: { style: AvatarStyle }) {
  if (style === 'initials') {
    return (
      <div className="w-7 h-7 rounded-full bg-blue flex items-center justify-center text-white text-2xs font-semibold">
        JD
      </div>
    );
  }
  const variantMap: Record<string, 'marble' | 'beam' | 'pixel' | 'ring'> = {
    marble: 'marble', beam: 'beam', pixel: 'pixel', ring: 'ring', mono: 'marble',
  };
  const colors = style === 'mono' ? getMonoPreviewPalette() : avatarPalette;
  return (
    <div style={{ width: 28, height: 28 }}>
      <BoringAvatar size={28} name="preview@example.com" variant={variantMap[style] || 'marble'} colors={colors} />
    </div>
  );
}

function SenderRulesManager() {
  const [rules, setRules] = useState<{ key: string; type: string; count: number }[]>([]);
  const [overrideCount, setOverrideCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    if (!window.api?.getSenderRules) return;
    const data = await window.api.getSenderRules();
    setRules(data.rules || []);
    setOverrideCount(data.overrideCount || 0);
    setLoaded(true);
  };

  const removeRule = async (key: string) => {
    if (!window.api?.removeSenderRule) return;
    await window.api.removeSenderRule(key);
    loadRules();
  };

  const clearAllOverrides = async () => {
    if (!confirm('Clear all thread overrides? Threads will be reclassified by the heuristic on next load.')) return;
    if (!window.api?.clearThreadOverrides) return;
    await window.api.clearThreadOverrides();
    loadRules();
  };

  if (!loaded) return null;

  return (
    <section>
      <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">Learned Classification Rules</h3>
      <p className="text-xs text-text-tertiary mb-3">
        These rules are learned when you move emails between categories. Domain rules (starting with @) apply to all senders on that domain.
      </p>

      {rules.length === 0 ? (
        <p className="text-xs text-text-tertiary italic">No sender or domain rules learned yet.</p>
      ) : (
        <div className="space-y-1 mb-3">
          {rules.map(r => (
            <div key={r.key} className="flex items-center justify-between px-2.5 py-1.5 rounded-md border border-border-primary bg-bg-primary">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs font-mono truncate ${r.key.startsWith('@') ? 'text-accent' : 'text-text-primary'}`}>
                  {r.key}
                </span>
                <span className="text-2xs text-text-tertiary shrink-0">→ {r.type}</span>
                {r.count > 1 && <span className="text-2xs text-text-tertiary shrink-0">({r.count}x)</span>}
              </div>
              <button
                onClick={() => removeRule(r.key)}
                className="p-1 rounded text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                title="Remove rule"
              >
                <IoTrashOutline size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-text-tertiary">
        <span>{overrideCount} thread override{overrideCount !== 1 ? 's' : ''}</span>
        {overrideCount > 0 && (
          <button onClick={clearAllOverrides} className="text-red-400 hover:underline cursor-pointer">
            Clear all overrides
          </button>
        )}
      </div>
    </section>
  );
}

function TroubleshootingSection() {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  const handleOpenFolder = () => {
    window.api?.openLogFolder?.();
  };

  const handleCopyLogs = async () => {
    if (!window.api?.getRecentLogs) return;
    setCopying(true);
    try {
      const logs = await window.api.getRecentLogs(300);
      await navigator.clipboard.writeText(logs);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
    setCopying(false);
  };

  return (
    <div className="space-y-6">
      <SenderRulesManager />

      <section>
        <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">Logs</h3>
        <p className="text-xs text-text-tertiary mb-3">
          Include logs when reporting bugs to help us diagnose the issue faster.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleOpenFolder}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-primary text-sm text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
          >
            <IoFolderOpenOutline size={14} />
            Open Log Folder
          </button>
          <button
            onClick={handleCopyLogs}
            disabled={copying}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-primary text-sm text-text-primary hover:bg-bg-hover transition-colors cursor-pointer disabled:opacity-50"
          >
            {copied ? <IoCheckmarkOutline size={14} className="text-green-500" /> : <IoCopyOutline size={14} />}
            {copied ? 'Copied!' : 'Copy Recent Logs'}
          </button>
        </div>
      </section>
    </div>
  );
}

function GeneralSettings() {
  const [viewMode, setViewMode] = useAtom(viewModeAtom);
  const [density, setDensity] = useAtom(densityAtom);
  const activeCategory = useAtomValue(activeCategoryAtom);
  const setActiveCategory = useSetAtom(setActiveCategoryAtom);
  const [showLabels, setShowLabels] = useAtom(showLabelsAtom);
  const [showViews, setShowViews] = useAtom(showViewsAtom);
  const [showAvatars, setShowAvatars] = useAtom(showAvatarsAtom);
  const [avatarStyle, setAvatarStyle] = useAtom(avatarStyleAtom);
  const [newsletterView, setNewsletterView] = useAtom(newsletterViewAtom);
  const undoSendDelay = useAtomValue(undoSendDelayAtom);
  const setUndoSendDelay = useSetAtom(setUndoSendDelayAtom);
  const [showFormattingToolbar, setShowFormattingToolbar] = useAtom(showFormattingToolbarAtom);
  const [crmExpanded, setCrmExpanded] = useAtom(crmPanelExpandedAtom);
  const [animationSpeed, setAnimationSpeed] = useAtom(animationSpeedAtom);
  const [afterAction, setAfterAction] = useAtom(afterActionAtom);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">Layout</h3>
        <div className="space-y-2">
          <span className="text-sm text-text-primary">View mode</span>
          <div className="flex gap-2">
            {(['split', 'list'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`flex-1 flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors cursor-pointer ${viewMode === mode ? 'border-accent bg-accent-subtle' : 'border-border-primary hover:border-border-primary/80'}`}>
                <div className="w-full h-12 rounded-md bg-bg-tertiary flex overflow-hidden">
                  {mode === 'split' ? (
                    <><div className="w-1/3 border-r border-border-primary bg-bg-hover" /><div className="flex-1" /></>
                  ) : (
                    <div className="flex-1 flex flex-col p-2 gap-1"><div className="h-2 w-3/4 rounded-sm bg-bg-hover" /><div className="h-2 w-1/2 rounded-sm bg-bg-hover" /></div>
                  )}
                </div>
                <span className="text-xs text-text-secondary">{mode === 'split' ? 'Split View' : 'List View'}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">Inbox</h3>
        <div className="space-y-1">
          <Select label="Default view" value={activeCategory} onChange={v => setActiveCategory(v as CategoryTab)} options={[
            { value: 'all', label: 'All Mail' }, { value: 'conversation', label: 'Conversations' },
            { value: 'newsletter', label: 'Newsletters' }, { value: 'notification', label: 'Updates' },
            { value: 'transactional', label: 'Receipts' }, { value: 'marketing', label: 'Promos' },
          ]} />
          <Select label="Newsletter view" value={newsletterView} onChange={v => setNewsletterView(v as NewsletterViewMode)} options={[
            { value: 'full', label: 'Full — render with images' }, { value: 'focused', label: 'Focused — text only' },
          ]} />
          <Select label="Density" value={density} onChange={v => setDensity(v as Density)} options={[
            { value: 'compact', label: 'Compact' }, { value: 'default', label: 'Default' }, { value: 'relaxed', label: 'Relaxed' },
          ]} />
          <Select label="Animations" value={animationSpeed} onChange={v => setAnimationSpeed(v as AnimationSpeed)} options={[
            { value: 'off', label: 'Off' }, { value: 'fast', label: 'Fast (100ms)' },
            { value: 'default', label: 'Default (200ms)' }, { value: 'slow', label: 'Slow (400ms)' },
          ]} />
          <Select label="After archive/trash" value={afterAction} onChange={v => setAfterAction(v as AfterAction)} options={[
            { value: 'next', label: 'Go to next email' },
            { value: 'inbox', label: 'Return to inbox' },
          ]} />
        </div>
      </section>

      <section>
        <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">Compose</h3>
        <div className="space-y-1">
          <Select label="Undo send delay" value={String(undoSendDelay)} onChange={v => setUndoSendDelay(parseInt(v, 10))} options={[
            { value: '0', label: 'Off' }, { value: '5', label: '5 seconds' },
            { value: '10', label: '10 seconds' }, { value: '15', label: '15 seconds' },
            { value: '20', label: '20 seconds' }, { value: '30', label: '30 seconds' },
          ]} />
          <Toggle label="Show formatting toolbar in compose" checked={showFormattingToolbar} onChange={setShowFormattingToolbar} />
          <p className="text-xxs text-text-tertiary pl-0.5">Show bold, italic, link, and list buttons above the compose editor. Markdown shortcuts always work regardless of this setting.</p>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">Sidebar</h3>
        <div className="space-y-1">
          <Toggle label="Show labels" checked={showLabels} onChange={setShowLabels} />
          <Toggle label="Show views (Sent, Spam, Trash)" checked={showViews} onChange={setShowViews} />
          <Toggle label="Show sender avatars" checked={showAvatars} onChange={setShowAvatars} />
          <Toggle label="Expand contact panel" checked={crmExpanded} onChange={setCrmExpanded} />
          <p className="text-xxs text-text-tertiary pl-0.5">Always expand the contact panel in conversations. When off, shows a collapsed strip.</p>
        </div>
      </section>

      {showAvatars && (
        <section>
          <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">Avatar Style</h3>
          <div className="flex gap-2">
            {([
              { id: 'marble' as AvatarStyle, label: 'Marble' },
              { id: 'beam' as AvatarStyle, label: 'Beam' },
              { id: 'pixel' as AvatarStyle, label: 'Pixel' },
              { id: 'ring' as AvatarStyle, label: 'Ring' },
              { id: 'mono' as AvatarStyle, label: 'Mono' },
              { id: 'initials' as AvatarStyle, label: 'Initials' },
            ]).map(s => (
              <button
                key={s.id}
                onClick={() => setAvatarStyle(s.id)}
                className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors cursor-pointer
                  ${avatarStyle === s.id ? 'border-accent bg-accent-subtle' : 'border-border-primary hover:border-border-primary/80'}`}
              >
                <AvatarPreview style={s.id} />
                <span className="text-2xs text-text-secondary">{s.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

function AppearanceSettings() {
  const mode = useAtomValue(themeModeAtom);
  const accent = useAtomValue(accentColorAtom);
  const saturation = useAtomValue(accentSaturationAtom);
  const setMode = useSetAtom(setThemeModeAtom);
  const setAccent = useSetAtom(setAccentColorAtom);
  const setSaturation = useSetAtom(setAccentSaturationAtom);

  const themePreviews: { id: ThemeMode; label: string; description: string; bg: string; fg: string; sidebar: string }[] = [
    { id: 'dark', label: 'Dark', description: 'Todoist-inspired dark', bg: '#1e1e1e', fg: '#e8e8e8', sidebar: '#252525' },
    { id: 'light', label: 'Light', description: 'Clean light theme', bg: '#ffffff', fg: '#1a1a1a', sidebar: '#f7f7f7' },
    { id: 'focus', label: 'Focus', description: 'Black & white, zero distraction', bg: '#000000', fg: '#e0e0e0', sidebar: '#0a0a0a' },
    { id: 'zen', label: 'Zen', description: 'Muted, calming tones', bg: '#1c1f26', fg: '#c8cdd5', sidebar: '#21252e' },
  ];

  const accentOptions: { id: AccentColor; color: string }[] = [
    { id: 'red', color: '#dc4c3e' }, { id: 'blue', color: '#4a9eff' }, { id: 'green', color: '#4caf50' },
    { id: 'purple', color: '#9c7cff' }, { id: 'orange', color: '#ff8c42' }, { id: 'teal', color: '#26a69a' },
  ];

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">Theme</h3>
        <div className="grid grid-cols-2 gap-2">
          {themePreviews.map(t => (
            <button key={t.id} onClick={() => setMode(t.id)}
              className={`flex flex-col items-start gap-1.5 p-3 rounded-lg border transition-colors cursor-pointer ${mode === t.id ? 'border-accent bg-accent-subtle' : 'border-border-primary hover:border-border-primary/80'}`}>
              <div className="w-full h-14 rounded-md flex overflow-hidden" style={{ backgroundColor: t.bg }}>
                <div className="w-1/4" style={{ backgroundColor: t.sidebar, borderRight: `1px solid ${t.bg}` }} />
                <div className="flex-1 p-2 flex flex-col gap-1">
                  <div className="h-1.5 w-3/4 rounded-sm" style={{ backgroundColor: t.fg, opacity: 0.3 }} />
                  <div className="h-1.5 w-1/2 rounded-sm" style={{ backgroundColor: t.fg, opacity: 0.15 }} />
                </div>
              </div>
              <div><span className="text-xs font-medium text-text-primary">{t.label}</span><p className="text-2xs text-text-tertiary">{t.description}</p></div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">Accent Color</h3>
        <div className="flex gap-2">
          {accentOptions.map(a => (
            <button key={a.id} onClick={() => setAccent(a.id)}
              className={`w-8 h-8 rounded-full transition-all cursor-pointer ${accent === a.id ? 'ring-2 ring-offset-2 ring-offset-bg-primary scale-110' : 'hover:scale-105'}`}
              style={{ backgroundColor: a.color, '--tw-ring-color': a.color } as React.CSSProperties} title={a.id} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">Saturation</h3>
        <div className="flex gap-1.5">
          {([
            { id: 'vibrant' as AccentSaturation, label: 'Vibrant', mult: 1.25 },
            { id: 'default' as AccentSaturation, label: 'Default', mult: 1.0 },
            { id: 'muted' as AccentSaturation, label: 'Muted', mult: 0.6 },
            { id: 'subtle' as AccentSaturation, label: 'Subtle', mult: 0.3 },
            { id: 'mono' as AccentSaturation, label: 'Mono', mult: 0 },
          ]).map(s => {
            const baseColor = accentOptions.find(a => a.id === accent)?.color || '#dc4c3e';
            const r = parseInt(baseColor.slice(1, 3), 16), g = parseInt(baseColor.slice(3, 5), 16), b = parseInt(baseColor.slice(5, 7), 16);
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            const preview = `rgb(${Math.round(gray + (r - gray) * s.mult)},${Math.round(gray + (g - gray) * s.mult)},${Math.round(gray + (b - gray) * s.mult)})`;
            return (
              <button key={s.id} onClick={() => setSaturation(s.id)}
                className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors cursor-pointer ${saturation === s.id ? 'border-accent bg-accent-subtle' : 'border-border-primary hover:border-border-primary/80'}`}>
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: preview }} />
                <span className="text-2xs text-text-secondary">{s.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const DEFAULT_SIGNATURES: { label: string; html: string }[] = [
  {
    label: 'Simple',
    html: '<p>Best,<br>{{name}}</p>',
  },
  {
    label: 'Professional',
    html: '<p>Best regards,<br><strong>{{name}}</strong><br><span style="color:#888">{{email}}</span></p>',
  },
  {
    label: 'Minimal',
    html: '<p>— {{name}}</p>',
  },
];

function SignatureEditor({ email, name }: { email: string; name: string }) {
  const [sig, setSig] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    window.api?.getSignature(email).then((s: string) => {
      setSig(s || '');
      setLoaded(true);
    });
  }, [email]);

  const handleSave = async () => {
    await window.api?.setSignature(email, sig);
    setSaved(true);
  };

  const applyTemplate = (html: string) => {
    const filled = html
      .replace(/\{\{name\}\}/g, name || email.split('@')[0])
      .replace(/\{\{email\}\}/g, email);
    setSig(filled);
    setSaved(false);
  };

  if (!loaded) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">{email}</span>
        {!saved && <span className="text-2xs text-accent">unsaved</span>}
      </div>
      <textarea
        value={sig}
        onChange={e => { setSig(e.target.value); setSaved(false); }}
        placeholder="HTML signature (leave empty for no signature)"
        rows={4}
        className="w-full text-xs text-text-primary bg-bg-tertiary border border-border-primary rounded-lg px-3 py-2 outline-none resize-y font-mono"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saved}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-accent text-white disabled:opacity-40 hover:bg-accent/90 transition-colors cursor-pointer disabled:cursor-default"
        >
          Save
        </button>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-2xs text-text-tertiary mr-1">Templates:</span>
          {DEFAULT_SIGNATURES.map(t => (
            <button
              key={t.label}
              onClick={() => applyTemplate(t.html)}
              className="px-2 py-1 rounded text-2xs text-text-secondary bg-bg-tertiary hover:bg-bg-hover transition-colors cursor-pointer"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {sig && (
        <div className="px-3 py-2 rounded-md border border-border-secondary bg-bg-primary">
          <div className="text-2xs text-text-tertiary mb-1">Preview</div>
          <div className="text-xs text-text-primary" dangerouslySetInnerHTML={{ __html: sig }} />
        </div>
      )}
    </div>
  );
}

function AccountsSettings() {
  const accounts = useAtomValue(accountsAtom);
  const checkAccounts = useSetAtom(checkAccountsAtom);
  const setAddingAccount = useSetAtom(addingAccountAtom);
  const [removing, setRemoving] = useState<string | null>(null);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this account? Email data will remain on the server.')) return;
    setRemoving(id);
    await window.api.removeAccount(id);
    await checkAccounts();
    setRemoving(null);
  };

  const providerIcon = (provider: string) => {
    if (provider === 'gmail') return <IoLogoGoogle size={16} className="text-[#4285f4]" />;
    if (provider === 'office365') return (
      <svg viewBox="0 0 21 21" width={16} height={16} className="shrink-0">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
    );
    return <IoPersonOutline size={16} className="text-text-tertiary" />;
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">Connected Accounts</h3>
        {accounts.length === 0 ? (
          <p className="text-sm text-text-tertiary">No accounts connected</p>
        ) : (
          <div className="space-y-2">
            {accounts.map(a => {
              const allEmails = [a.email, ...(a.aliases || [])];
              const isExpanded = expandedAccount === a.id;
              return (
                <div key={a.id} className="rounded-lg border border-border-primary bg-bg-primary overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <button
                      onClick={() => setExpandedAccount(isExpanded ? null : a.id)}
                      className="flex items-center gap-3 flex-1 text-left cursor-pointer"
                    >
                      {providerIcon(a.provider)}
                      <div>
                        <div className="text-sm text-text-primary font-medium">{a.name}</div>
                        <div className="text-xs text-text-tertiary">
                          {a.email}
                          {(a.aliases?.length || 0) > 0 && (
                            <span className="text-text-tertiary"> + {a.aliases!.length} alias{a.aliases!.length > 1 ? 'es' : ''}</span>
                          )}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => handleRemove(a.id)}
                      disabled={removing === a.id}
                      className="p-1.5 rounded-md text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                      title="Remove account"
                    >
                      <IoTrashOutline size={14} />
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-border-secondary">
                      <div className="pt-3 mb-2 text-xs font-medium text-text-tertiary uppercase tracking-wider">Signatures</div>
                      {allEmails.map(email => (
                        <SignatureEditor key={email} email={email} name={a.name} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <button
        onClick={() => setAddingAccount(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border-primary text-sm text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
      >
        <IoAddOutline size={16} />
        Add Account
      </button>
    </div>
  );
}

type AIProvider = 'openai' | 'anthropic' | 'openwebui' | 'ollama';

interface AISettingsData {
  enabled: boolean;
  provider: AIProvider;
  endpoint: string;
  apiKey: string;
  model: string;
}

const providerPresets: Record<AIProvider, { endpoint: string; model: string; label: string; description: string }> = {
  openai: { endpoint: 'https://api.openai.com', model: 'gpt-4o-mini', label: 'OpenAI', description: 'GPT-4o-mini recommended (~$0.0003/email)' },
  anthropic: { endpoint: 'https://api.anthropic.com', model: 'claude-haiku-4-5-20251001', label: 'Anthropic', description: 'Claude Haiku recommended' },
  openwebui: { endpoint: '', model: '', label: 'Open WebUI', description: 'Self-hosted Open WebUI instance' },
  ollama: { endpoint: 'http://localhost:11434', model: 'llama3.2', label: 'Ollama', description: 'Local Ollama instance' },
};

function AISettings() {
  const [settings, setSettings] = useState<AISettingsData>({
    enabled: false, provider: 'openai', endpoint: '', apiKey: '', model: '',
  });
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!window.api?.getAISettings) return;
    window.api.getAISettings().then((s: AISettingsData) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  const updateField = <K extends keyof AISettingsData>(key: K, value: AISettingsData[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
    setTestResult(null);
  };

  const selectProvider = (provider: AIProvider) => {
    const preset = providerPresets[provider];
    setSettings(prev => ({
      ...prev,
      provider,
      endpoint: prev.endpoint && prev.provider !== provider ? preset.endpoint : prev.endpoint || preset.endpoint,
      model: prev.model && prev.provider !== provider ? preset.model : prev.model || preset.model,
    }));
    setSaved(false);
    setTestResult(null);
  };

  const handleSave = async () => {
    if (!window.api?.saveAISettings) return;
    await window.api.saveAISettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    if (!window.api?.testAIConnection) return;
    setTesting(true);
    setTestResult(null);
    const result = await window.api.testAIConnection(settings);
    setTestResult(result);
    setTesting(false);
  };

  if (!loaded) return <div className="text-sm text-text-tertiary">Loading...</div>;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">AI Email Sorting</h3>
        <p className="text-xs text-text-tertiary mb-3">
          Use AI to improve email classification when the built-in heuristic is uncertain.
          Only emails that can't be confidently sorted are sent to AI — typically 5-15% of your inbox.
        </p>
        <Toggle label="Enable AI-enhanced sorting" checked={settings.enabled} onChange={v => updateField('enabled', v)} />
      </section>

      {settings.enabled && (
        <>
          <section>
            <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">Provider</h3>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(providerPresets) as [AIProvider, typeof providerPresets[AIProvider]][]).map(([id, preset]) => (
                <button
                  key={id}
                  onClick={() => selectProvider(id)}
                  className={`flex flex-col items-start p-3 rounded-lg border transition-colors cursor-pointer text-left
                    ${settings.provider === id ? 'border-accent bg-accent-subtle' : 'border-border-primary hover:border-border-primary/80'}`}
                >
                  <span className="text-sm font-medium text-text-primary">{preset.label}</span>
                  <span className="text-2xs text-text-tertiary mt-0.5">{preset.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">Connection</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">API Endpoint</label>
                <input
                  type="text"
                  value={settings.endpoint}
                  onChange={e => updateField('endpoint', e.target.value)}
                  placeholder={providerPresets[settings.provider].endpoint || 'https://your-instance.com'}
                  className="w-full bg-bg-input border border-border-primary rounded-md px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent placeholder:text-text-tertiary"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">API Key</label>
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={e => updateField('apiKey', e.target.value)}
                  placeholder={settings.provider === 'ollama' ? 'Optional for local Ollama' : 'sk-...'}
                  className="w-full bg-bg-input border border-border-primary rounded-md px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent placeholder:text-text-tertiary"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Model</label>
                <input
                  type="text"
                  value={settings.model}
                  onChange={e => updateField('model', e.target.value)}
                  placeholder={providerPresets[settings.provider].model}
                  className="w-full bg-bg-input border border-border-primary rounded-md px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent placeholder:text-text-tertiary"
                />
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTest}
                disabled={testing || !settings.endpoint}
                className="px-4 py-2 rounded-lg border border-border-primary text-sm text-text-primary hover:bg-bg-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg bg-accent text-accent-text text-sm font-medium hover:bg-accent-hover transition-colors cursor-pointer"
              >
                {saved ? 'Saved' : 'Save'}
              </button>
              {saved && <IoCheckmarkCircleOutline size={16} className="text-green-500" />}
            </div>
            {testResult && (
              <div className={`mt-2 text-xs ${testResult.success ? 'text-green-500' : 'text-red-400'}`}>
                {testResult.success ? 'Connection successful — AI classified a test email correctly.' : `Error: ${testResult.error}`}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

const settingsContent: Record<SettingsTab, () => React.JSX.Element> = {
  general: GeneralSettings,
  appearance: AppearanceSettings,
  notifications: () => <div className="text-sm text-text-tertiary">Notification settings coming soon</div>,
  ai: AISettings,
  accounts: AccountsSettings,
  troubleshooting: TroubleshootingSection,
};

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const Content = settingsContent[activeTab];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl h-[70vh] bg-bg-secondary border border-border-primary rounded-xl shadow-2xl flex overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="w-44 bg-bg-primary border-r border-border-secondary p-2 shrink-0">
          <div className="flex items-center justify-between px-2 py-2 mb-2">
            <span className="text-sm font-semibold text-text-primary">Settings</span>
            <button onClick={onClose} className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer">
              <IoCloseOutline size={14} />
            </button>
          </div>
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors cursor-pointer mb-0.5
                  ${activeTab === tab.id ? 'bg-bg-hover text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover/50'}`}>
                <Icon size={14} />{tab.label}
              </button>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto p-6"><Content /></div>
      </div>
    </div>
  );
}

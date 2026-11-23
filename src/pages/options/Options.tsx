import { useEffect, useState } from 'preact/hooks';
import { read, update, exportAll, wipeAll, bytesInUse, STORAGE_QUOTA_BYTES } from '@/services/storage.service';
import { DEFAULT_TRACKING_PARAMS } from '@/core/duplicates/canonical';
import { DEFAULT_WEIGHTS } from '@/core/memory/estimate';
import { CATEGORIES } from '@/types/tab';
import type { Settings } from '@/types/storage';
import { DEFAULT_SETTINGS } from '@/types/storage';
import { Button } from '@/components/ui/primitives';
import { MemoryWeightsSection } from '@/components/options/MemoryWeights';
import { applyTheme } from '@/hooks/useTheme';

/** Settings. The privacy statement lives here in plain language, not in a modal nobody reads. */
export function Options() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [bytes, setBytes] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void read.settings().then(setSettings);
    void bytesInUse().then(setBytes);
  }, []);

  const save = async (patch: Partial<Settings>): Promise<void> => {
    const next = await update.settings((s) => ({ ...s, ...patch }));
    setSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const download = async (): Promise<void> => {
    const data = await exportAll();
    // A local blob URL. No network, no upload, no server — see PRIVACY.md.
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tab-debt-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const trackingList = settings.trackingParams.length ? settings.trackingParams : DEFAULT_TRACKING_PARAMS;
  const weights = settings.memoryWeights.base ? settings.memoryWeights : DEFAULT_WEIGHTS;

  return (
    <div class="mx-auto max-w-2xl px-6 py-8">
      <h1 class="text-md font-semibold">Tab Debt settings</h1>
      {saved && <p class="mt-1 text-xs text-good" role="status">Saved.</p>}

      <section class="mt-6 border-t border-rule pt-4">
        <h2 class="text-sm font-medium">Comfortable baseline</h2>
        <p class="mt-1 text-xs text-muted">
          The number of tabs that feels fine to you. Debt is measured against this, not against zero.
        </p>
        <label class="mt-2 flex items-center gap-2">
          <span class="sr-only">Comfortable tab count</span>
          <input
            type="number"
            min={1}
            max={500}
            value={settings.baseline}
            onChange={(e) => void save({ baseline: Number((e.target as HTMLInputElement).value) })}
            class="num w-24 rounded-sm border border-rule bg-card px-2 py-1 text-sm"
          />
          <span class="text-xs text-muted">tabs</span>
        </label>
      </section>

      <section class="mt-6 border-t border-rule pt-4">
        <h2 class="text-sm font-medium">Theme</h2>
        <div class="mt-2 flex gap-1.5">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                applyTheme(t);
                void save({ theme: t });
              }}
              aria-pressed={settings.theme === t}
              class={`rounded-sm border px-2 py-1 text-xs capitalize ${settings.theme === t ? 'border-ledger bg-ledger text-[color:var(--paper)]' : 'border-rule hover:bg-[color:var(--ledger-soft)]'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section class="mt-6 border-t border-rule pt-4">
        <h2 class="text-sm font-medium">Category overrides</h2>
        <p class="mt-1 text-xs text-muted">
          A site you set here keeps that category permanently, ahead of every built-in rule.
        </p>
        <ul class="mt-2 space-y-1">
          {Object.entries(settings.overrides).map(([domain, category]) => (
            <li key={domain} class="flex items-center gap-2">
              <span class="num flex-1 truncate text-xs">{domain}</span>
              <select
                value={category}
                onChange={(e) => {
                  const value = (e.target as HTMLSelectElement).value as (typeof CATEGORIES)[number];
                  void save({ overrides: { ...settings.overrides, [domain]: value } });
                }}
                class="rounded-sm border border-rule bg-card px-1 py-0.5 text-xs"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <Button
                onClick={() => {
                  const next = { ...settings.overrides };
                  delete next[domain];
                  void save({ overrides: next });
                }}
              >
                Remove
              </Button>
            </li>
          ))}
          {Object.keys(settings.overrides).length === 0 && (
            <li class="text-xs text-muted">
              No overrides yet. Anything you add here beats every built-in rule.
            </li>
          )}
        </ul>

        <form
          class="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget as HTMLFormElement;
            const domain = (form.elements.namedItem('domain') as HTMLInputElement).value
              .trim()
              .toLowerCase()
              // Accept a pasted URL as readily as a bare domain — asking a user to strip
              // "https://" and the path by hand is a needless way to make them feel wrong.
              .replace(/^https?:\/\//, '')
              .replace(/^www\./, '')
              .replace(/\/.*$/, '');
            if (!domain) return;
            const category = (form.elements.namedItem('category') as HTMLSelectElement)
              .value as (typeof CATEGORIES)[number];
            void save({ overrides: { ...settings.overrides, [domain]: category } });
            form.reset();
          }}
        >
          <label class="flex-1">
            <span class="sr-only">Site to override</span>
            <input
              name="domain"
              type="text"
              placeholder="example.com"
              class="num w-full rounded-sm border border-rule bg-card px-2 py-1 text-xs"
            />
          </label>
          <label>
            <span class="sr-only">Category for this site</span>
            <select name="category" class="rounded-sm border border-rule bg-card px-1 py-1 text-xs">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="primary">
            Add override
          </Button>
        </form>
      </section>

      <section class="mt-6 border-t border-rule pt-4">
        <h2 class="text-sm font-medium">Tracking parameters</h2>
        <p class="mt-1 text-xs text-muted">
          Stripped before comparing addresses, so a link with a tracking tag counts as a duplicate of
          the same link without one. One per line; <code>*</code> matches a prefix.
        </p>
        <textarea
          value={trackingList.join('\n')}
          onChange={(e) =>
            void save({
              trackingParams: (e.target as HTMLTextAreaElement).value.split('\n').map((s) => s.trim()).filter(Boolean),
            })
          }
          rows={6}
          class="num mt-2 w-full rounded-sm border border-rule bg-card p-2 text-xs"
        />
      </section>

      <MemoryWeightsSection weights={weights} onChange={(memoryWeights) => void save({ memoryWeights })} />

      <section class="mt-6 border-t border-rule pt-4">
        <h2 class="text-sm font-medium">Your data</h2>
        <p class="mt-1 text-xs text-muted">
          Everything Tab Debt knows lives on this computer, in this browser profile. It makes no
          network requests of any kind — no accounts, no servers, no analytics, no remote fonts or
          icons. Nothing about your tabs leaves your machine, so there is nothing for us to see,
          sell or lose. Uninstalling deletes it all.
        </p>
        <p class="num mt-2 text-2xs text-muted">
          Using {(bytes / 1024).toFixed(0)} KB of {(STORAGE_QUOTA_BYTES / 1024 / 1024).toFixed(0)} MB
        </p>
        <div class="mt-2 flex gap-1.5">
          <Button onClick={() => void download()}>Export a copy</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm('Delete all Tab Debt data? Your tabs are not affected. This cannot be undone.')) {
                void wipeAll().then(() => read.settings().then(setSettings));
              }
            }}
          >
            Delete all data
          </Button>
        </div>
      </section>

      <p class="mt-6 border-t border-rule pt-4 text-2xs text-muted">
        More by AR Labs:{' '}
        {[
          ['Prism - Color Picker', 'fnolbffnpeamdpjepbgmlajdeakfecfb'],
          ['Website Roast', 'khjanpephopmklcgpjjimbdnpbnknnga'],
          ['Inbox Janitor', 'lagoddlfnhlflblgfakcenjonpkpkpmo'],
          ['Grabbit - Web Scraper', 'eoaacdkiehhbjfebnnabbammefccioef'],
        ].map(([name, id], i) => (
          <span key={id}>
            {i ? ' · ' : ''}
            <a
              href={`https://chromewebstore.google.com/detail/${id}`}
              target="_blank"
              rel="noopener"
              class="underline underline-offset-2 hover:opacity-80"
            >
              {name}
            </a>
          </span>
        ))}
      </p>
    </div>
  );
}

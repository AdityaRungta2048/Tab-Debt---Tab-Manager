import { useState } from 'preact/hooks';
import { update } from '@/services/storage.service';
import { Button } from '@/components/ui/primitives';

/**
 * Three screens, skippable at every step.
 *
 * The brief caps this at three and this uses all three, because each one earns its place:
 * what the score is, what will never happen to your tabs, and the single setting the score
 * depends on. Nothing here celebrates, congratulates or gamifies — the emotional target is
 * relief, and an extension that high-fives you on install has misread the room.
 */
export function Onboarding({ tabCount, onDone }: { tabCount: number; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [baseline, setBaseline] = useState(25);

  const finish = async (withBaseline: boolean): Promise<void> => {
    await update.settings((s) => ({
      ...s,
      onboarded: true,
      ...(withBaseline ? { baseline } : {}),
    }));
    onDone();
  };

  const screens = [
    {
      title: 'You have tab debt, not a tab problem.',
      body: (
        <>
          <p>
            Tab Debt looks at the {tabCount.toLocaleString()} tabs you have open and gives them
            one number: how much is worth paying down, and which chunk to start with.
          </p>
          <p class="mt-2">
            The score is a reading, not a verdict. It goes down when you act, and it tells you
            exactly which part of it each action removes.
          </p>
        </>
      ),
    },
    {
      title: 'Nothing closes without you.',
      body: (
        <>
          <p>
            No tab is ever closed automatically, on a timer, or in the background. Every action
            shows you exactly which tabs it affects first, and every one can be undone — from the
            toast, or from the history panel two minutes later.
          </p>
          <p class="mt-2">
            Large sweeps save to bookmarks before closing, and if a single bookmark fails to
            save, nothing is closed at all.
          </p>
          <p class="mt-2 text-muted">
            Undo cannot bring back scroll position, form contents or page history. Everything
            else comes back where it was.
          </p>
        </>
      ),
    },
    {
      title: 'How many tabs feel fine to you?',
      body: (
        <>
          <p>
            Debt is measured against this number, not against zero. Some people are comfortable
            at 10, some at 80. There is no right answer and it can be changed any time.
          </p>
          <label class="mt-3 flex items-center gap-2">
            <span class="sr-only">Comfortable tab count</span>
            <input
              type="number"
              min={1}
              max={500}
              value={baseline}
              onInput={(e) => setBaseline(Number((e.target as HTMLInputElement).value) || 25)}
              class="num w-24 rounded-sm border border-rule bg-card px-2 py-1 text-sm"
            />
            <span class="text-xs text-muted">tabs</span>
          </label>
        </>
      ),
    },
  ];

  const current = screens[step]!;
  const isLast = step === screens.length - 1;

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--paper)] p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div class="w-full max-w-md rounded border border-rule bg-card p-5">
        <p class="num text-2xs uppercase tracking-[0.12em] text-muted">
          {step + 1} of {screens.length}
        </p>
        <h2 id="onboarding-title" class="mt-1 text-md font-semibold">
          {current.title}
        </h2>
        <div class="mt-2 space-y-1 text-xs leading-relaxed">{current.body}</div>

        <div class="mt-5 flex items-center gap-2">
          <Button size="md" variant="primary" onClick={() => (isLast ? void finish(true) : setStep(step + 1))}>
            {isLast ? 'Start' : 'Next'}
          </Button>
          {step > 0 && (
            <Button size="md" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {/* Skippable at every step, not only the first. */}
          <button
            type="button"
            onClick={() => void finish(false)}
            class="ml-auto text-xs text-muted underline underline-offset-2 hover:text-ink"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

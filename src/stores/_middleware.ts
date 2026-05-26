import type { StateCreator } from "zustand";
import { devtools, persist, subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

// Example usage:
//   export const useFooStore = create<FooState>()(
//     withStandardMiddleware<FooState>(
//       (set) => ({
//         count: 0,
//         increment: () => set((s) => { s.count += 1; }),
//       }),
//       { name: "FooStore" },
//     ),
//   );

export interface StandardMiddlewareOptions<T> {
  name: string;

  partialize?: (state: T) => unknown;

  persistVersion?: number;

  devtoolsEnabled?: boolean;

  persistEnabled?: boolean;

  immerEnabled?: boolean;

  persistKey?: string;

  migrate?: (persistedState: unknown, version: number) => unknown;
}

type StandardMutators = [
  ["zustand/devtools", never],
  ["zustand/persist", unknown],
  ["zustand/immer", never],
  ["zustand/subscribeWithSelector", never],
];

export function withStandardMiddleware<T>(
  initializer: StateCreator<T, StandardMutators, [], T>,
  opts: StandardMiddlewareOptions<T>,
): StateCreator<T, [], StandardMutators, T> {
  // biome-ignore lint/suspicious/noExplicitAny: Zustand middleware composition loses generic mutator precision.
  let chain: any = initializer;
  chain = subscribeWithSelector(chain);
  if (opts.immerEnabled !== false) {
    chain = immer(chain);
  }
  if (opts.persistEnabled !== false) {
    // biome-ignore lint/suspicious/noExplicitAny: Persist options are assembled conditionally from generic store options.
    const persistOpts: any = {
      name: opts.persistKey ?? opts.name,
    };
    if (opts.partialize) persistOpts.partialize = opts.partialize;
    if (opts.persistVersion !== undefined) persistOpts.version = opts.persistVersion;
    if (opts.migrate) persistOpts.migrate = opts.migrate;
    chain = persist(chain, persistOpts);
  }
  if (opts.devtoolsEnabled !== false) {
    chain = devtools(chain, {
      name: opts.name,
      enabled: opts.devtoolsEnabled,
    });
  }
  return chain;
}

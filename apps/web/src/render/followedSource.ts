import type { ClientStore } from '../model/clientStore';

/** Feeds `show` the ids of the followed people whenever the followed list changes. */
export function bindFollowed(
  store: ClientStore,
  show: (followed: ReadonlySet<string>) => void,
): () => void {
  return store.select(
    (state) => ({ followed: state.followed }),
    ({ followed }) => show(new Set(followed.map((person) => person.id))),
  );
}

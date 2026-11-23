import type { ParticipantGender } from "shared";

/**
 * The participant's session. Participants reach the app through a space's join link rather than by
 * registering, so their tokens are all that identifies them — losing them means joining again.
 */

export type SessionParticipant = {
  id: string;
  spaceId: string;
  name: string;
  age: number | null;
  gender: ParticipantGender | null;
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  participant: SessionParticipant;
};

const STORAGE_KEY = "fizo.participant";

const load = (): Session | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
};

const store = $state<{ current: Session | null }>({ current: load() });

export const session = {
  get current() {
    return store.current;
  },

  get participant() {
    return store.current?.participant ?? null;
  },

  set(next: Session) {
    store.current = next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },

  /** Replaces just the tokens, keeping the participant, after a refresh. */
  setTokens(tokens: { accessToken: string; refreshToken: string }) {
    if (!store.current) return;
    session.set({ ...store.current, ...tokens });
  },

  clear() {
    store.current = null;
    localStorage.removeItem(STORAGE_KEY);
  },
};

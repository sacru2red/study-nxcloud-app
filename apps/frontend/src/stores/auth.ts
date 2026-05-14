import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

interface UserInfo {
  userId: string;
  email: string;
  tenantId: string;
  role: 'admin' | 'user';
}

export const tokenAtom = atomWithStorage<string | null>('accessToken', null);
export const userAtom = atomWithStorage<UserInfo | null>('user', null);
export const isAuthenticatedAtom = atom((get) => get(tokenAtom) !== null);

export const logoutAtom = atom(null, (_get, set) => {
  set(tokenAtom, null);
  set(userAtom, null);
});

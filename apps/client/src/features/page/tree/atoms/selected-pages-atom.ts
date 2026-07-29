import { atom } from "jotai";

export const selectedPagesAtom = atom<Set<string>>(new Set<string>());

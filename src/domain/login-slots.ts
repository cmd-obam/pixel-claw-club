export type CharacterSlot = 1 | 2 | 3;

export interface LoginSlot {
  slot: CharacterSlot;
  occupied: boolean;
  nickname: string | null;
}

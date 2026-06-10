/** One-use items carried into a run and triggered with the on-screen buttons. */
export interface ConsumableDef {
  id: 'bomb' | 'rocket';
  name: string;
  emoji: string;
  price: number;
  desc: string;
}

export const CONSUMABLES: ConsumableDef[] = [
  { id: 'bomb', name: '폭탄', emoji: '💣', price: 250, desc: '주변 장애물 폭파 + 임시 무적' },
  { id: 'rocket', name: '로켓', emoji: '🚀', price: 450, desc: '하늘로 비행 & 모든 장애물 통과' },
];

export function getConsumable(id: string): ConsumableDef {
  return CONSUMABLES.find((c) => c.id === id)!;
}

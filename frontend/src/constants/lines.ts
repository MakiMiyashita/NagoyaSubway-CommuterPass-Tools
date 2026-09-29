import type { LineId } from '../types';

export const LINE_INFO: Record<LineId, { name: string; code: string; color: string }> = {
  higashiyama: { name: '東山線', code: 'H', color: '#f2b43c' },
  meijo: { name: '名城線', code: 'M', color: '#9d62bd' },
  meiko: { name: '名港線', code: 'E', color: '#a373b7' },
  tsurumai: { name: '鶴舞線', code: 'T', color: '#16a4d2' },
  sakuradori: { name: '桜通線', code: 'S', color: '#d74957' },
  kamiiida: { name: '上飯田線', code: 'K', color: '#ef8fa1' },
};

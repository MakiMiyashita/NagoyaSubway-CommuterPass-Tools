import { useState } from 'react';

interface Props {
  onClose: () => void;
}

const pages = [
  {
    title: '欲しい駅から定期券を探す',
    body: '定期券に通したい駅を地図から選択することで最適な経路を提案します',
    mark: '◎',
  },
  {
    title: '優先度を決める',
    body: '必ず通る駅，できれば通る駅，通らない駅を指定できます．始発・終着駅も設定可能です',
    mark: '◇',
  },
  {
    title: '経路を比較する',
    body: '希望の達成数，料金区，駅数で経路を比較できます．あとから条件を足すことも可能です',
    mark: '↗',
  },
];

export function Onboarding({ onClose }: Props) {
  const [page, setPage] = useState(0);
  const item = pages[page];

  return (
    <div className="onboarding-backdrop" role="presentation">
      <section className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <button className="text-button onboarding-skip" onClick={onClose}>スキップ</button>
        <div className="onboarding-mark" aria-hidden="true">{item.mark}</div>
        <p className="eyebrow">はじめに</p>
        <h2 id="onboarding-title">{item.title}</h2>
        <p>{item.body}</p>
        <div className="onboarding-footer">
          <div className="page-dots" aria-label={`${page + 1} / ${pages.length}ページ`}>
            {pages.map((_, index) => <span key={index} className={index === page ? 'active' : ''} />)}
          </div>
          <button className="primary-button" onClick={() => page === pages.length - 1 ? onClose() : setPage(page + 1)}>
            {page === pages.length - 1 ? '使ってみる' : '次へ'}
          </button>
        </div>
      </section>
    </div>
  );
}

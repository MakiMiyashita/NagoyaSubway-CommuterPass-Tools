# なごや地下鉄定期ナビ

希望する駅と予算から，名古屋市営地下鉄の定期券経路候補を探索する非公式Webアプリである．Reactによるフロントエンドと，FastAPI・clingoによる経路計算APIで構成する．

## 公開URL

[なごや地下鉄定期ナビを開く](https://nagoya-subway-route-navi.onrender.com/)

無料APIは一定時間アクセスがないと停止するため，最初の検索に時間がかかる場合がある．

## 対象範囲

- 名古屋市営地下鉄6路線と地下鉄内の乗換駅
- 1区から5区までの通勤・学生・割引定期券
- 始発・終着駅，必須駅，希望駅，通さない駅を指定した候補探索
- 経路候補の並べ替えと絞り込み

他社線との連絡定期，市バスとの割引連絡定期，地下鉄全線定期などは探索対象外である．

## ディレクトリ構成

```text
.
├── frontend/    # React・Viteによる画面
├── backend/     # FastAPI・clingoによる経路探索API
├── render.yaml  # Render Blueprint
└── README.md
```

## ローカル起動

リポジトリ直下でAPI環境を準備する．

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app:app --reload --port 8000
```

別のターミナルでフロントエンドを起動する．

```bash
cd frontend
npm install
npm run dev
```

ブラウザで `http://localhost:3000/` を開く．スマートフォンから同一LAN内で確認する場合は，両方のサーバーを `--host 0.0.0.0` で起動し，MacのIPアドレスへ接続する．

## 環境変数

フロントエンド：

```text
VITE_API_BASE_URL=http://localhost:8000
```

API：

```text
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
SOLVER_TIMEOUT_SECONDS=6
MAX_CONCURRENT_JOBS=2
RATE_LIMIT_REQUESTS=10
RATE_LIMIT_WINDOW_SECONDS=60
JOB_TTL_SECONDS=900
```

本番環境では，`VITE_API_BASE_URL` に公開APIのHTTPS URL，`ALLOWED_ORIGINS` に公開フロントエンドのオリジンを指定する．`ALLOWED_ORIGIN_REGEX` は同一LANの端末から開発確認するときだけ設定し，本番では空欄にする．検索は既定で同時2件，クライアントごとに60秒間で10回まで受け付け，完了した検索ジョブは900秒後に破棄する．

## Renderへの公開

リポジトリ直下の `render.yaml` は，フロントエンドをStatic Site，APIをシンガポールリージョンのFree Web Serviceとして作成する．RenderでBlueprintを作成するとき，次の値を入力する．

- フロントエンドの `VITE_API_BASE_URL`：作成されたAPIの `https://...onrender.com`
- APIの `ALLOWED_ORIGINS`：作成されたフロントエンドの `https://...onrender.com`

URL末尾の `/` は付けない．Free Web Serviceは非稼働後に停止するため，最初の検索だけ起動待ちが発生する場合がある．独自ドメインは初回公開後に追加できる．

## 検証

```bash
cd frontend
npm run typecheck
npm run build
```

API・ソルバー：

```bash
python -m unittest discover -s backend/tests
```

## 情報源と免責

本サービスは個人制作の非公式サービスであり，名古屋市交通局とは関係ない．表示する経路・料金は参考情報で，定期券の発売・購入可否は保証しない．購入前に公式情報または駅窓口で確認すること．

- [名古屋市交通局](https://www.kotsu.city.nagoya.jp/)
- [地下鉄普通料金・定期券料金](https://map.kotsu.city.nagoya.jp/rp/subway/trp0000172.htm)
- [定期券の購入方法](https://www.kotsu.city.nagoya.jp/rp/ticket/trp0000283.htm)
- [公式路線図](https://www.kotsu.city.nagoya.jp/rp/subway/routemap.html)

## 問い合わせ

不具合や掲載情報の修正は，[GitHub Issues](https://github.com/MakiMiyashita/NagoyaSubway-CommuterPass-Tools/issues)から連絡すること．定期券の購入可否など，個別の交通案内には回答しない．

## 著作権

© 2026 NagoyaSubway-CommuterPass-Tools

本リポジトリにはオープンソースライセンスを付与していない．ソースコードを閲覧できることは，利用，複製，改変，再配布等を許諾するものではない．第三者のソフトウェアおよび情報源に関する権利は，各権利者に帰属する．

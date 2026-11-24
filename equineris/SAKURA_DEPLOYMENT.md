# EQUINERIS：GitHub → さくらサーバーの公開・復旧手順

## 確定済みの構成

- ソースの編集元：GitHub `main`（`hopekotobuki2515-ux/smart-diet`）
- 利用者向けURL：`https://rakudadou.sakura.ne.jp/smart-diet/equineris/`
- さくらサーバーの対象：`/home/rakudadou/www/smart-diet/equineris/`
- 共有ファイル：`/home/rakudadou/www/smart-diet/` 直下の以下6ファイル
  - `food-search.html`, `food-master.json`
  - `nutrient-food-search.html`, `nutrient-master.json`, `nutrient-panel.js`
  - `program.css`
- 公開ワークフロー：`.github/workflows/deploy-equineris-sakura.yml`
- 認証情報：GitHub Secrets `SAKURA_SSH_KEY` と Variables `SAKURA_HOST`, `SAKURA_USER`

## 通常の編集と公開

1. WorkまたはGitHubで必要なファイルのみ編集し、ブランチ／PRでレビューする。
2. 既存のテストを実行し、失敗を解決してから `main` にマージする。
3. `main` の該当ファイル変更で「Deploy EQUINERIS to Sakura」が自動起動する。
4. デプロイワークフローは、構文・操作・スマホ表示テストに合格した場合だけファイルを転送する。
5. ワークフローの実行ログで「Sakura files verified」「Sakura HTTPS pages verified」を確認する。
6. 利用者のブラウザで画面・ボタン・記録の保存／再表示を確認する。

バックアップは転送直前にサーバー内の `/home/rakudadou/equineris-deploy-backups/` に作られる。既存ファイルは転送時に更新されるが、対象ディレクトリ外のファイルを削除しない。古いファイルの自動削除もしない。

## 手動再公開

GitHubの Actions → 「Deploy EQUINERIS to Sakura」→ Run workflow から `main` を指定する。
手動実行でも自動テストが完了するまで転送しない。

## 不具合時と復旧

1. 直近の GitHub Actions を確認し、検証エラー・SSH接続エラー・転送エラー・HTTPSエラーを分けて扱う。
2. アプリのソースに問題があればGitHubで修正または対象コミットを revert し、テスト合格後に再公開する。
3. サーバー上の静的ファイルを前回デプロイ直前に戻す必要があれば、さくらサーバーの SSH 接続で事前確認し、対応するバックアップ `predeploy-YYYYMMDD-HHMMSS.tar.gz` の内容を検査してから、`/home/rakudadou/www/smart-diet/` に展開する。**対象外サイトは操作しない。**
4. バックアップを自動で削除する設定はないため、空き容量は管理する。

## データ保全について

現行のEQUINERISは一部データをブラウザの localStorage / IndexedDB に保存する。GitHubのデプロイではそれらを操作しないが、**GitHub Pagesとさくらドメイン間でブラウザ内の記録が自動同期されるわけではない**。旧ドメインの保存済み記録を誤って初期化したり、データ移行済みと扱ったりしないこと。ログイン／別端末同期の完成は、この静的ファイル移行とは別の確認事項。

## 次回Workでの指示例

「`hopekotobuki2515-ux/smart-diet` を開き、既存のEQUINERISを必要箇所だけ修正してください。Pull Requestでテストを確認してからmainにマージし、GitHub Actionsの『Deploy EQUINERIS to Sakura』が成功するまで検証してください。正常なコードや表示は変更しないでください。」

## 安全上の注意

秘密鍵の本文をチャット・GitHubのコード・ログに出さない。SSHのホスト鍵検証は本番の運用セキュリティ事項として別途厳密な照合が必要。現在の ssh-keyscan はホスト鍵を自動取得する方式であり、事前に既知の正しいホスト鍵との突き合わせを行う方式ではない。

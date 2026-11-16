# Firebase 本番適用手順

## 共通パスワードの導入（公開候補）

既存の個別ログインに加え、12週間プログラムを初めて利用するアカウントで共通パスワードを確認する。開始済みの利用者と従来の食習慣ナビは既存の権限で利用できる。

1. 本番の現行ルールを控え、`npm test` と `npm run test:rules` を実行する。
2. 運営者がパスワード管理ツールで十分に長いランダムな共通パスワードを生成する。個別ログインのパスワードと使い回さない。
3. 共通パスワードを UTF-8 の SHA-256 に変換する。Windows PowerShell では、次を実行すると入力を伏せたまま小文字の16進数を表示できる。

   ```powershell
   $smartDietSecret = Read-Host 'SMART Dietの共通パスワード' -AsSecureString
   $smartDietPlain = [System.Net.NetworkCredential]::new('', $smartDietSecret).Password
   $smartDietHasher = [System.Security.Cryptography.SHA256]::Create()
   try {
     [BitConverter]::ToString($smartDietHasher.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($smartDietPlain))).Replace('-', '').ToLowerInvariant()
   } finally {
     $smartDietHasher.Dispose()
     Remove-Variable smartDietSecret,smartDietPlain,smartDietHasher
   }
   ```

4. Firestore のデータ画面で `programInvites` コレクションを作り、64文字の変換結果をドキュメント ID に設定する。フィールドは `active`（boolean）= `true`。パスワードも変換結果もリポジトリやチャットに貼らない。
5. 本番での切替時に `firestore.rules.draft` を公開し、公開候補版を GitHub Pages に反映する。この間、初回設定だけ一時的に利用できない場合がある。
6. テスト用アカウントで誤ったパスワードの拒否と、正しいパスワードでの初回設定・保存を確認する。既存利用者の記録、担当コーチの表示も確認する。
7. パスワードを変更するときは、新しい変換結果のドキュメントを有効化し、旧ドキュメントを `active: false` にする。登録済みの利用者は引き続き利用できる。

## 既存のコーチ機能を導入した際の手順（履歴）

対象プロジェクト: `smart-diet-a5d4e` / Cloud Firestore `(default)`。
実UIDは公開リポジトリに保存しない。Authentication画面でコーチと対象利用者を確認してから管理者が設定する。

## 適用前

1. Firebase Console の Authentication → ユーザーで、コーチと対象利用者のUIDをそれぞれ検索し、アカウントを照合する。
2. Firestore → ルールで現在公開済みのルールを保存しておく。`users/{userId}/{document=**}` の本人専用ルールが、このリポジトリの `firestore.rules.draft` と一致することを再確認する。異なる場合は適用を中止し、現在のルールとの差分を調べる。
3. `npm test` と `npm run test:rules` を実施。後者はデモプロジェクトのローカルEmulatorを使用し、本番には書き込まない。

## 適用

1. Firestore → ルールに `firestore.rules.draft` の**全体**を貼り付け、公開する。ユーザー本人の従来の読み書きは残し、担当コーチの新しい読み取り・コメント書き込みを追加する構成。
2. Firestore → データでトップレベルの `coachAssignments` コレクションを作成する。ドキュメントIDは**対象利用者のFirebase Auth UID**、フィールドは `coachUid`（型: string、値: **コーチのFirebase Auth UID**）。自動生成IDを使わない。両UIDを逆に入れない。
3. ほかの利用者への担当設定は作成しない。

## 適用後の確認

1. 利用者自身で `program.html` の記録・再読込を確認する。初回設定前のアカウントでは、設定を保存してから確認する。
2. 担当コーチで `coach.html` にログインし、対象の1名だけが一覧に出ること、記録を閲覧できることを確認する。
3. コメントを下書き保存した時は利用者画面に出ず、公開後に対象週の利用者画面だけに出ることを確認する。
4. 非担当アカウントで同じ記録やコメントを読めないことを確認する。コーチの `smartDiet` 旧記録は閲覧できないことも確認する。

`program.html` と `coach.html` は現在ドラフトPR内にあるため、現行のGitHub Pagesの公開URLにはまだ反映されない。ルールの適用とドキュメント作成だけで画面の本番動作確認は完了しない。

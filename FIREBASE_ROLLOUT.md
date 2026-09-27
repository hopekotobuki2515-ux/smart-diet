# Firebase 本番適用手順（未実施）

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

'use strict';

// ライブラリのインポート
const { Sequelize, DataTypes } = require('sequelize');
const fs = require('fs');

// PATという認証方法がclarifaiにコードがあったため、使用してみます。
// Your PAT (Personal Access Token) can be found in the Account's Security section
const PAT = '17c0f812836746219f1457df5ecf80f8';
// Specify the correct user_id/app_id pairings
// Since you're making inferences outside your app's scope
const USER_ID = 'spo8ww6fi7d1';
const APP_ID = 'Sorting-garbage';
// Change these to whatever model and image URL you want to use
const MODEL_ID = 'datasets';
const MODEL_VERSION_ID = '05dff8d0f28942b88e6b978819fca449';
const IMAGE_URL = 'https://samples.clarifai.com/metro-north.jpg';


// renderのpostgres接続
const DB_INFO = "postgresql://gomibunbetsu_user:3RXVNYAx0HM4r2SHxkM7z2L0uJpxzueE@dpg-d1r4jg3ipnbc73f1prng-a.singapore-postgres.render.com/gomibunbetsu";

const pg_option = { ssl: { rejectUnauthorized: false } };
const sequelize = new Sequelize(DB_INFO, {
    dialect: 'postgres',
    dialectOptions: pg_option
});

// データベースに保存するゴミの分別ルールを定義する
const GarbageRules = sequelize.define('GarbageRule', {
    itemName: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    },
    category: {
        type: DataTypes.STRING
    },
    rule: {
        type: DataTypes.TEXT
    }
});

async function setupDatabase() {
    try {
        await sequelize.authenticate();
        console.log('データベース接続成功');
        await GarbageRules.sync({ alter: true });
        console.log('テーブル同期完了');


        // 川崎市多摩区のゴミ分別ルール
        // 多摩区登戸で考えました。実際のデータです。
        await GarbageRules.upsert({
            itemName: 'pet_bottle',
            category: 'ペットボトル',
            rule: '【月曜日】\nキャップとラベルを外し、中を軽くすすいでください。潰して、透明・半透明な袋に入れて出してください。'
        });

        await GarbageRules.upsert({
            itemName: 'can',
            category: '空き缶',
            rule: '【月曜日】\n中を軽くすすいで、透明・半透明な袋に入れて出してください。'
        });

        await GarbageRules.upsert({
            itemName: 'spray_can',
            category: 'スプレー缶・カセットボンベ',
            rule: '【月曜日】\n中身を完全に使い切って、透明・半透明な袋に入れて出してください。\n\n■中身が残っている場合は、火の気のない屋外で出し切り、「空き缶・ペットボトル」として同様に出して下さい。もし出し切れない場合は「中身入り」と貼り紙をして「小物金属」の日に出してください。'
        });

        await GarbageRules.upsert({
            itemName: 'plastic',
            category: 'プラスチック',
            rule: '【木曜日】\nプラマークが目印です。中身を使い切り、きれいに洗って乾かしてから、透明・半透明の袋に入れて出してください。しかし、汚れが落ちないものは「普通ごみ」へ。'
        });

        await GarbageRules.upsert({
            itemName: 'paper',
            category: 'ミックスペーパー',
            rule: '【火曜日】\n紙袋に入れる、紐で結ぶなどして出して下さい。汚れている場合は、「普通ごみ」として出してください。'
        });

        await GarbageRules.upsert({
            itemName: 'glass_bottle',
            category: '空きびん',
            rule: '【月曜日】\nキャップを外し、中を軽くすすいでください。袋には入れず、収集場所に設置された「空きびん専用カゴ」へ直接入れてください。化粧品のびんや割れたびんは「普通ごみ」です。'
        });

        await GarbageRules.upsert({
            itemName: 'battery',
            category: '使用済み乾電池',
            rule: '【月曜日】\n透明な袋に入れて出してください。ボタン電池やリチウムイオン電池は市では収集しません（販売店の回収ボックスへ）。'
        });

        await GarbageRules.upsert({
            itemName: 'burnable_other',
            category: '普通ごみ',
            rule: '【水曜日、土曜日】\n資源物や小物金属以外の、50cm未満のごみが対象です。生ゴミ、汚れたプラスチック、おもちゃ、革製品、ゴム製品、割れた陶器やガラスなどが含まれます。透明・半透明な袋、または蓋付きポリ袋に入れて出してください'
        });

        console.log('初期データ投入完了');
    } catch (error) {
        console.error('データベース接続または設定でエラー:', error);
    }
}

// メインのボットプログラム
module.exports = (robot) => {
    // データベースのセットアップを実行
    setupDatabase();

    // 投稿された時の処理
    robot.on('file', (res, file) => {
        res.send("写真を解析中... 🤔🤔🤔🤔");

        // directからファイルをダウンロード
        res.download(file, (path) => {
            const imageBytes = fs.readFileSync(path, { encoding: "base64" });

            const raw = JSON.stringify({
                "user_app_id": {
                    "user_id": USER_ID,
                    "app_id": APP_ID
                },
                "inputs": [{ "data": { "image": { "base64": imageBytes } } }]
            });

            const requestOptions = {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': 'Key ' + PAT
                },
                body: raw
            };

            fetch(`https://api.clarifai.com/v2/models/${MODEL_ID}/outputs`, requestOptions)
                .then(response => response.json())
                .then(async (result) => {
                    if (result.status.code !== 10000) {
                        console.error("Clarifai 処理エラー:", result.status.description);
                        res.send("この画像はうまく解析できなかった...。別の写真で試して下さい。");
                        return;
                    }

                    const concept = result.outputs[0].data.concepts[0];
                    const predictedItem = concept.name;
                    const confidence = concept.value;
                    console.log(`予測結果: ${predictedItem} (確信度: ${confidence})`);

                    if (confidence < 0.7) {
                        res.send(`これは「${predictedItem}」でしょうか？ もう一度試して下さい。`);
                        return;
                    }

                    // データベースから分別ルールを検索
                    const dbResult = await GarbageRules.findByPk(predictedItem);
                    if (dbResult) {
                        res.send(`これは【${dbResult.category}】です。\n\n**分別方法**:\n${dbResult.rule}`);
                    } else {
                        res.send(`これは「${predictedItem}」ですね。しかし、そのゴミの分別ルールはまだデータベースに登録されていません。`);
                    }
                })
                .catch(error => {
                    console.error("Clarifai APIエラー:", error);
                    res.send("AIの調子が悪いようです。もう一度試して下さい。");
                });
        });
    });
};
'use strict';

// ライブラリのインポート
const { Sequelize, DataTypes } = require('sequelize');
const fs = require('fs');

// PATという認証方法がclarifaiにコードがあったため、使用してみます。
// Renderの環境変数から情報を取得する
const PAT = process.env.PAT;
const USER_ID = process.env.USER_ID;
const APP_ID = process.env.APP_ID;
const MODEL_ID = process.env.MODEL_ID;

// Render上で動くときは内部URLを、ローカルで動かすときは外部URLを使う
const DB_INFO = process.env.DATABASE_URL;


const pg_option = { ssl: { rejectUnauthorized: false } };
const sequelize = new Sequelize(DB_INFO, {
    dialect: 'postgres',
    dialectOptions: pg_option
});

const GarbageRules = sequelize.define('GarbageRule', {
    itemName: { type: DataTypes.STRING, allowNull: false, primaryKey: true },
    category: { type: DataTypes.STRING },
    rule: { type: DataTypes.TEXT }
});

async function setupDatabase() {
    try {
        await sequelize.authenticate();
        await GarbageRules.sync({ alter: true });
        // 川崎市多摩区のゴミ分別ルール
        // 多摩区登戸で考えました。実際のデータです。
        await GarbageRules.upsert({
            itemName: 'pet_bottle',
            category: 'ペットボトル',
            rule: '空き缶、ペットボトル（月曜日）\nキャップとラベルを外し、中を軽くすすいでください。潰して、透明・半透明な袋に入れて出してください。'
        });

        await GarbageRules.upsert({
            itemName: 'can',
            category: '空き缶',
            rule: '空き缶、ペットボトル（月曜日）\n中を軽くすすいで、透明・半透明な袋に入れて出してください。'
        });

        await GarbageRules.upsert({
            itemName: 'spray_can',
            category: 'スプレー缶',
            rule: '空き缶、ペットボトル（月曜日）\n中身を完全に使い切って、透明・半透明な袋に入れて出してください。\n\n■中身が残っている場合は、火の気のない屋外で出し切り、「空き缶・ペットボトル」として同様に出して下さい。もし出し切れない場合は「中身入り」と貼り紙をして「小物金属」の日に出してください。'
        });

        await GarbageRules.upsert({
            itemName: 'plastic',
            category: 'プラスチック',
            rule: 'プラ容器（木曜日）\nプラマークが目印です。中身を使い切り、きれいに洗って乾かしてから、透明・半透明の袋に入れて出してください。しかし、汚れが落ちないものは「普通ごみ」へ。'
        });

        await GarbageRules.upsert({
            itemName: 'paper',
            category: '古紙類',
            rule: 'ミックスペーパー（火曜日）\n紙袋に入れる、紐で結ぶなどして出して下さい。汚れている場合は、「普通ごみ」として出してください。'
        });

        await GarbageRules.upsert({
            itemName: 'glass_bottle',
            category: '空きびん',
            rule: 'びん（月曜日）\nキャップを外し、中を軽くすすいでください。袋には入れず、収集場所に設置された「空きびん専用カゴ」へ直接入れてください。化粧品のびんや割れたびんは「普通ごみ」です。'
        });

        await GarbageRules.upsert({
            itemName: 'battery',
            category: '乾電池',
            rule: '電池（月曜日）\n透明な袋に入れて出してください。ボタン電池やリチウムイオン電池は市では収集しません（販売店の回収ボックスへ）。'
        });

        await GarbageRules.upsert({
            itemName: 'burnable_other',
            category: '燃えるごみ',
            rule: '普通ごみ（水曜日、土曜日）\n資源物や小物金属以外の、50cm未満のごみが対象です。生ゴミ、汚れたプラスチック、おもちゃ、革製品、ゴム製品、割れた陶器やガラスなどが含まれます。透明・半透明な袋、または蓋付きポリ袋に入れて出してください'
        });

        console.log("データベースの準備が完了しました。");
    } catch (error) {
        console.error('データベース設定エラー:', error);
    }
}

// メイン
module.exports = (robot) => {
    setupDatabase();

    robot.hear(/Hubot (\{.*\})/, (res) => {
        res.send("写真を解析中...⏳");

        try {
            const jsonString = res.match[1];
            const fileInfo = JSON.parse(jsonString);

            res.download(fileInfo, (path) => {
                const imageBytes = fs.readFileSync(path, { encoding: "base64" });
                const raw = JSON.stringify({
                    "user_app_id": { "user_id": USER_ID, "app_id": APP_ID },
                    "inputs": [{ "data": { "image": { "base64": imageBytes } } }]
                });
                const requestOptions = {
                    method: 'POST',
                    headers: { 'Accept': 'application/json', 'Authorization': 'Key ' + PAT },
                    body: raw
                };

                fetch(`https://api.clarifai.com/v2/models/${MODEL_ID}/outputs`, requestOptions)
                    .then(response => response.json())
                    .then(async (result) => {
                        if (result.status.code !== 10000 || !result.outputs) {
                            console.error("Clarifai 処理エラー:", result.status);
                            res.send("うまく解析できませんでした。別の写真で試してみて下さい。");
                            return;
                        }
                        const concept = result.outputs[0].data.concepts[0];
                        const predictedItem = concept.name;
                        const confidence = concept.value;

                        if (confidence < 0.7) {
                            res.send(`うまく分類できなかったので、別の画像で試してみて下さい。`);
                            return;
                        }

                        const dbResult = await GarbageRules.findByPk(predictedItem);
                        if (dbResult) {
                            res.send(`これは ${dbResult.category} です。\n\n【ごみの種類、収集日】\n${dbResult.rule}`);
                        } else {
                            res.send(`「${predictedItem}」と判断しましたが、そのゴミの分別ルールはまだデータベースに登録されていません。`);
                        }
                    })
                    .catch(error => {
                        console.error("Clarifai通信エラー:", error);
                        res.send("AIとの通信でエラーが発生しました。時間をおいて再度お試しください。");
                    });
            });
        } catch (e) {
            console.error("ファイル情報の解析に失敗しました:", e);
            res.send("ファイル情報の解析に失敗しました。もう一度お試しください。");
        }
    });
};
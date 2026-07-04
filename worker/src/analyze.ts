import type { AnalyzeResult } from '@mahjong/shared';

const MODEL = 'gemini-2.5-flash'; // 無料枠で利用可能
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const PROMPT = `これは自動雀卓（全自動麻雀卓）の点数表示部を撮影した写真です。
4人分の点数が表示されており、配置は「下=撮影者自身、右、上、左」です。
各プレイヤーの点数を正確に読み取ってください。
本来の得点は表示されている値の100倍ですが、その計算は後処理で行うので、あなたは表示されている値をそのまま返してください。
読み取れない場合は該当プレイヤーを0としてください。`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    bottom: { type: 'INTEGER', description: '下（撮影者自身）の点数' },
    right: { type: 'INTEGER', description: '右のプレイヤーの点数' },
    top: { type: 'INTEGER', description: '上のプレイヤーの点数' },
    left: { type: 'INTEGER', description: '左のプレイヤーの点数' },
  },
  required: ['bottom', 'right', 'top', 'left'],
};

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  error?: { message?: string };
}

/** Discord Webhookに通知を送る。失敗しても呼び出し元の処理は継続させる。 */
export async function notifyDiscord(webhookUrl: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
    return res.ok;
  } catch (e) {
    console.error('Discord通知に失敗:', e);
    return false;
  }
}

export async function analyzeScoreImage(
  apiKey: string,
  imageBase64: string,
  mediaType: string,
  discordWebhookUrl?: string,
): Promise<AnalyzeResult> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mediaType, data: imageBase64 } },
            { text: PROMPT },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    if (res.status === 429) {
      if (discordWebhookUrl) {
        await notifyDiscord(discordWebhookUrl, '⚠️ Gemini APIの無料枠の利用制限（429）に達しました。');
      }
      throw new Error('Gemini APIの無料枠の利用制限に達しました。しばらく待つか、点数を手動で入力してください。');
    }
    throw new Error(`Gemini APIエラー (${res.status}): ${data.error?.message ?? '不明なエラー'}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!text) {
    throw new Error('解析結果を取得できませんでした。点数を手動で入力してください。');
  }
  return JSON.parse(text) as AnalyzeResult;
}

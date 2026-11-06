// Vercel Serverless Function：/api/sync
// 把整份記帳資料存到 Upstash Redis（Vercel Marketplace 可一鍵加入）。
// 合併邏輯在前端（mergeState，逐筆以較晚修改為準），這裡只負責存取。

const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || 'redis ' + r.status);
  return j.result;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET' && req.query && req.query.ping !== undefined) {
      // 診斷：瀏覽器開 /api/sync?ping 可確認 API 與 Redis 是否正常
      if (!URL_ || !TOKEN) return res.status(200).json({ api: 'ok', redis: '未設定（缺少環境變數）' });
      try { return res.status(200).json({ api: 'ok', redis: await redis(['PING']) }); }
      catch (e) { return res.status(200).json({ api: 'ok', redis: '連線失敗：' + e.message }); }
    }
    if (!URL_ || !TOKEN) return res.status(500).json({ error: '伺服器尚未設定 Redis（缺少環境變數）' });
    // 個人使用：所有裝置固定讀寫同一份資料，不需要代碼
    const key = 'pocket:main';

    if (req.method === 'GET') {
      const v = await redis(['GET', key]);
      return res.status(200).json({ data: v ? JSON.parse(v) : null });
    }
    if (req.method === 'PUT') {
      const data = req.body && req.body.data;
      if (!data || !Array.isArray(data.tx) || !Array.isArray(data.cards))
        return res.status(400).json({ error: '資料格式不正確' });
      const s = JSON.stringify(data);
      if (s.length > 900000) return res.status(413).json({ error: '資料過大' });
      await redis(['SET', key, s]);
      return res.status(200).json({ ok: true, ts: data.ts || 0 });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
};

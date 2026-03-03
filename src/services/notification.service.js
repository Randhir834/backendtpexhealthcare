import https from "https";

function postJson(url, { body, headers }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: "POST",
        hostname: u.hostname,
        path: `${u.pathname}${u.search}`,
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode || 0, body: data });
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function sendPushToExternalUserIds({ externalUserIds, title, body, data }) {
  const appId = String(process.env.ONESIGNAL_APP_ID || "").trim();
  const apiKey = String(process.env.ONESIGNAL_REST_API_KEY || "").trim();

  const ids = (externalUserIds || []).map((x) => String(x || "").trim()).filter(Boolean);
  if (ids.length === 0) {
    return { success: true, sent: 0 };
  }

  if (!appId || !apiKey) {
    return { success: false, sent: 0, message: "OneSignal not configured" };
  }

  const payload = {
    app_id: appId,
    include_external_user_ids: ids,
    channel_for_external_user_ids: "push",
    headings: { en: String(title || "") },
    contents: { en: String(body || "") },
    data: data || {},
  };

  const resp = await postJson("https://onesignal.com/api/v1/notifications", {
    body: JSON.stringify(payload),
    headers: {
      Authorization: `Basic ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (resp.statusCode >= 200 && resp.statusCode < 300) {
    return { success: true, sent: ids.length };
  }

  return {
    success: false,
    sent: 0,
    message: `OneSignal request failed: ${resp.statusCode}${resp.body ? ` - ${resp.body}` : ""}`,
  };
}

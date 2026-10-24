const BASE_URL = "https://connect.mailerlite.com/api";

export async function testMailerLiteConnection(apiKey) {
  if (!apiKey) {
    const err = new Error("MailerLite API key is missing. Add it in Blog-2.0 → MailerLite.");
    err.status = 400;
    throw err;
  }

  const res = await fetch(`${BASE_URL}/groups?limit=10`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  const body = await res.json().catch(() => ({}));

  if (res.status === 401) {
    const err = new Error("MailerLite rejected the API key (401 Unauthenticated).");
    err.status = 401;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(body?.message || `MailerLite API error (${res.status})`);
    err.status = res.status;
    throw err;
  }

  const groups = Array.isArray(body?.data) ? body.data : [];
  return {
    ok: true,
    group_count: groups.length,
    groups: groups.map((g) => ({
      id: String(g.id),
      name: g.name,
      active_count: g.active_count,
    })),
  };
}

type GhlRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

const GHL_BASE_URL = "https://services.leadconnectorhq.com";

export async function ghlRequest<T>(
  path: string,
  options: GhlRequestOptions = {}
): Promise<T> {
  const token = process.env.GHL_ACCESS_TOKEN;
  const version = process.env.GHL_API_VERSION || "2021-07-28";

  if (!token) {
    throw new Error("Missing GHL_ACCESS_TOKEN in environment variables.");
  }

  const response = await fetch(`${GHL_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Version: version,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store"
  });

  const text = await response.text();

  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    console.error("GHL API Error:", {
      status: response.status,
      path,
      data
    });

    throw new Error(`GHL API failed with status ${response.status}`);
  }

  return data as T;
}
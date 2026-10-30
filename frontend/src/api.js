const API = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "");

async function request(url, options = {}) {
  if (!API) {
    throw new Error(
      "Backend API URL is not configured. Set VITE_API_URL in the frontend hosting settings and redeploy."
    );
  }

  let response;
  try {
    response = await fetch(`${API}${url}`, options);
  } catch {
    throw new Error(
      "Could not reach the backend API. Check its URL, deployment status, and allowed frontend origin."
    );
  }

  const responseText = await response.text();
  let data = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      if (!response.ok) {
        throw new Error(
          `Backend API returned ${response.status} instead of JSON. Check that VITE_API_URL points to the backend API ending in /api.`
        );
      }

      throw new Error("Backend API returned an invalid response.");
    }
  }

  if (!response.ok) {
    throw new Error(data.error || `Backend API request failed (${response.status}).`);
  }

  return data;
}

export const getConfigStatus = () =>
  request("/config/status");

export const getCustomers = () =>
  request("/customers");

export const getMessages = phone =>
  request(`/customers/${encodeURIComponent(phone)}/messages`);

export const importCSV = file => {
  const form = new FormData();
  form.append("file", file);

  return request("/customers/import", {
    method: "POST",
    body: form
  });
};

export const uploadCampaignImage = file => {
  const form = new FormData();
  form.append("image", file);

  return request("/campaigns/upload-image", {
    method: "POST",
    body: form
  });
};

export const sendCampaign = (
  templateName,
  language = "en_US",
  headerImageUrl = "",
  headerImageId = ""
) =>
  request("/campaigns/send-template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      templateName,
      language,
      headerImageUrl,
      headerImageId
    })
  });
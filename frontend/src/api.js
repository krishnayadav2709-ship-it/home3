const API = import.meta.env.VITE_API_URL;

async function request(url, options = {}) {
  const response = await fetch(`${API}${url}`, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

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

export const sendCampaign = (templateName, language = "en_US") =>
  request("/campaigns/send-template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateName, language })
  });
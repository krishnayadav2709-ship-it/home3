import { useEffect, useState } from "react";
import {
  getCustomers,
  getConfigStatus,
  getMessages,
  getMessageMediaUrl,
  importCSV,
  sendCampaign,
  uploadCampaignImage
} from "./api";
import "./index.css";

export default function App() {
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState([]);
  const [messageRefreshToken, setMessageRefreshToken] = useState(0);
  const [configStatus, setConfigStatus] = useState(null);
  const [file, setFile] = useState(null);
  const [template, setTemplate] = useState("");
  const [language, setLanguage] = useState("en");
  const [headerType, setHeaderType] = useState("none");
  const [imageSource, setImageSource] = useState("upload");
  const [headerImageUrl, setHeaderImageUrl] = useState("");
  const [headerImageFile, setHeaderImageFile] = useState(null);
  const [result, setResult] = useState("");
  const [campaignResult, setCampaignResult] = useState(false);
  const [campaignFailures, setCampaignFailures] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const orderedCustomers = [...customers].sort((left, right) => {
    const leftActivity = new Date(left.lastMessageAt || 0).getTime() || 0;
    const rightActivity = new Date(right.lastMessageAt || 0).getTime() || 0;
    return rightActivity - leftActivity;
  });

  async function refresh() {
    try {
      setCustomers(await getCustomers());
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }

  function openCustomer(phone) {
    if (phone !== selected) {
      setMessages([]);
      setError("");
    }
    setSelected(phone);
  }

  useEffect(() => {
    refresh();
    getConfigStatus()
      .then(setConfigStatus)
      .catch(e => setError(e.message));

    const customerRefresh = setInterval(() => {
      getCustomers()
        .then(setCustomers)
        .catch(e => setError(e.message));
    }, 5000);

    return () => clearInterval(customerRefresh);
  }, []);

  useEffect(() => {
    if (!selected) return undefined;

    let active = true;
    const refreshMessages = async () => {
      try {
        const latestMessages = await getMessages(selected);
        if (active) setMessages(latestMessages);
      } catch (e) {
        if (active) setError(e.message);
      }
    };

    refreshMessages();
    const messageRefresh = setInterval(refreshMessages, 5000);

    return () => {
      active = false;
      clearInterval(messageRefresh);
    };
  }, [selected, messageRefreshToken]);

  async function handleImport(e) {
    e.preventDefault();
    if (!file || busy) return;

    if (
      customers.length > 0 &&
      !window.confirm(
        "This CSV will replace the current customer list. Continue?"
      )
    ) return;

    setBusy(true);
    setError("");
    setResult("");
    setCampaignResult(false);

    try {
      const data = await importCSV(file);
      setResult(
        `Import complete — ${data.imported} imported, ${data.skipped} skipped.`
      );
      setFile(null);
      e.target.reset();
      await refresh();
      setSelected("");
      setMessages([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCampaign(e) {
    e.preventDefault();
    if (!template.trim() || busy) return;

    if (!window.confirm(
      "Send this approved template to all opted-in customers?"
    )) return;

    setBusy(true);
    setError("");
    setCampaignFailures([]);
    setResult("Campaign processing...");
    setCampaignResult(true);

    try {
      let headerImageId = "";
      if (headerType === "image" && imageSource === "upload") {
        const uploaded = await uploadCampaignImage(headerImageFile);
        headerImageId = uploaded.mediaId;
      }

      const data = await sendCampaign(
        template.trim(),
        language,
        headerType === "image" && imageSource === "url"
          ? headerImageUrl.trim()
          : "",
        headerImageId
      );
      setCampaignFailures(data.failures || []);
      setResult(
        `Total: ${data.total} | Accepted: ${data.sent} | Failed: ${data.failed}`
      );

      if (selected) setMessageRefreshToken(token => token + 1);
    } catch (e) {
      setError(e.message);
      setResult("");
      setCampaignResult(false);
      setCampaignFailures([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>Trinetram Next-Gen Software PVT LTD</h1>
          <p>Campaigns, customers and conversations</p>
        </div>
        {/* <button onClick={refresh} disabled={busy}>Refresh</button> */}
      </header>

      <section className="panel" aria-labelledby="business-profile-heading">
        <div className="section-heading">
          <h2 id="business-profile-heading">Business profile</h2>
          <span>Meta app details</span>
        </div>

        <dl className="business-details">
          <div>
            <dt>Display name</dt>
            <dd>Trinetram NextGen Software</dd>
          </div>
          <div>
            <dt>App ID</dt>
            <dd>1106267098458142</dd>
          </div>
          <div>
            <dt>Contact email</dt>
            <dd>
              <a href="mailto:info@trinetramsoftware.com">
                info@trinetramsoftware.com
              </a>
            </dd>
          </div>
          <div>
            <dt>Privacy policy</dt>
            <dd>
              <a
                href="https://trinetramsoftware.com/"
                target="_blank"
                rel="noreferrer"
              >
                trinetramsoftware.com
              </a>
            </dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>Business and pages</dd>
          </div>
        </dl>
      </section>

      <section className="panel" aria-labelledby="whatsapp-setup-heading">
        <div className="section-heading">
          <h2 id="whatsapp-setup-heading">WhatsApp setup</h2>
          <span>Credentials stay on the backend</span>
        </div>
        <p>
          Never enter access tokens or app secrets in this page. Configure
          them in the backend hosting environment.
        </p>
        <div className="setup-status">
          <div>
            <strong>WhatsApp Cloud API</strong>
            {configStatus ? (
              configStatus.whatsappApi.configured ? (
                <span className="status-ready">Configured</span>
              ) : (
                <span className="status-missing">
                  Missing: {configStatus.whatsappApi.missing.join(", ")}
                </span>
              )
            ) : (
              <span>Checking backend configuration…</span>
            )}
          </div>
          <div>
            <strong>Webhook verification</strong>
            {configStatus ? (
              configStatus.webhook.configured ? (
                <span className="status-ready">Configured</span>
              ) : (
                <span className="status-missing">
                  Missing: {configStatus.webhook.missing.join(", ")}
                </span>
              )
            ) : (
              <span>Checking backend configuration…</span>
            )}
          </div>
        </div>
        <p className="field-hint">
          Set missing values in the backend service environment, then redeploy.
          The frontend only needs <code>VITE_API_URL</code> set to your backend
          URL ending in <code>/api</code>.
        </p>
      </section>

      {error && <div className="notice error">{error}</div>}
      {result && <div className="notice">{result}</div>}

      <section className="panel">
        <h2>1. Import customers</h2>
        <p>CSV columns: name, phone, optedIn</p>
        <p className="field-hint">
          Importing a CSV replaces the current customer list with the customers
          in that file.
        </p>

        <form className="actions" onSubmit={handleImport}>
          <input
            type="file"
            accept=".csv,text/csv"
            required
            onChange={e => setFile(e.target.files?.[0] || null)}
          />
          <button disabled={busy || !file}>
            Import CSV
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>2. Bulk template campaign</h2>
        <p>
          Only send approved templates to customers who have consented.
        </p>
        <p className="field-hint">
          Recipients: {customers.filter(customer => customer.optedIn).length} opted-in
          customers. Use the exact approved template name and matching language.
          Templates with required variables are not supported yet.
        </p>

        <form className="actions" onSubmit={handleCampaign}>
          <label className="form-field">
            <span>Approved template name</span>
            <input
              value={template}
              onChange={e => setTemplate(e.target.value)}
              onPaste={e => {
                const pastedText = e.clipboardData.getData("text");
                if (!pastedText) return;

                e.preventDefault();
                const [name] = pastedText.trim().split(/\s*[·•]\s*/, 1);
                setTemplate(name.trim());
              }}
              placeholder="e.g. order_update"
              pattern="[a-z0-9_]+"
              title="Use lowercase letters, numbers, and underscores. You can paste the full Meta title; the template name will be extracted."
              required
            />
            <span className="field-hint">
              Paste the template name or its Meta title, such as{" "}
              <code>trinetram_diwali_offer_2026 · English</code>.
            </span>
          </label>

          <label className="form-field">
            <span>Template language</span>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
            >
              <option value="en">English (Default)</option>
              <option value="en_US">English (US)</option>
              <option value="en_GB">English (UK)</option>
              <option value="hi">Hindi</option>
            </select>
          </label>

          <label className="form-field">
            <span>Template header</span>
            <select
              value={headerType}
              onChange={e => setHeaderType(e.target.value)}
            >
              <option value="none">No header</option>
              <option value="image">Image</option>
            </select>
            <span className="field-hint">
              Match this to the approved template. Header mismatches can cause
              WhatsApp error 132012.
            </span>
          </label>

          {headerType === "image" && (
            <>
              <label className="form-field">
                <span>Image source</span>
                <select
                  value={imageSource}
                  onChange={e => setImageSource(e.target.value)}
                >
                  <option value="upload">Upload from this device</option>
                  <option value="url">Public image URL</option>
                </select>
              </label>

              {imageSource === "upload" ? (
                <label className="form-field">
                  <span>Choose an image (JPEG or PNG, up to 5 MB)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    required
                    onChange={e => setHeaderImageFile(e.target.files?.[0] || null)}
                  />
                </label>
              ) : (
                <label className="form-field">
                  <span>Public image URL</span>
                  <input
                    type="url"
                    value={headerImageUrl}
                    onChange={e => setHeaderImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    required
                  />
                  <span className="field-hint">
                    Use a public HTTPS image link that Meta can access without login.
                  </span>
                </label>
              )}
            </>
          )}

          <button
            disabled={
              busy ||
              !template.trim() ||
              (headerType === "image" &&
                ((imageSource === "upload" && !headerImageFile) ||
                  (imageSource === "url" && !headerImageUrl.trim())))
            }
          >
            {busy ? "Please wait..." : "Send campaign"}
          </button>
        </form>
        {campaignFailures.length > 0 && (
          <div className="notice error" role="status">
            <strong>Why WhatsApp rejected the messages:</strong>
            <ul>
              {campaignFailures.map(failure => (
                <li key={`${failure.code}-${failure.subcode || ""}-${failure.message}`}>
                  {failure.count} message{failure.count === 1 ? "" : "s"} —{" "}
                  {failure.message} (code: {failure.code}
                  {failure.subcode ? `, subcode: ${failure.subcode}` : ""})
                  {failure.traceId ? ` · Meta trace: ${failure.traceId}` : ""}
                </li>
              ))}
            </ul>
            <p>
              Match the header choice to the approved template: choose No header
              for templates without an image header, or Image for templates
              with an image header. For error 132012, check the template's
              language, header format, and the number/order of body values.
            </p>
          </div>
        )}
        {campaignResult && (
          <p className="field-hint">
            Accepted means WhatsApp accepted the API request; delivery
            confirmation comes later through message status updates.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>3. Customer inbox</h2>
          <span>{customers.length} customers · updates every 5 seconds</span>
        </div>

        <div className="inbox">
          <aside className="customer-list">
            {orderedCustomers.map(customer => (
              <button
                key={customer.phone}
                className={`customer ${
                  selected === customer.phone ? "active" : ""
                }`}
                onClick={() => openCustomer(customer.phone)}
              >
                <strong>{customer.name}</strong>
                <span>{customer.phone}</span>
                <small>
                  {customer.optedIn ? "Opted in" : "No consent recorded"}
                </small>
              </button>
            ))}

            {!customers.length && (
              <p>No customers yet. Import a CSV or wait for an incoming message.</p>
            )}
          </aside>

          <div className="conversation">
            <h3>{selected || "Select a customer"}</h3>

            {messages.map(message => (
              <article
                key={message._id}
                className={`message ${message.direction}`}
              >
                <p>{message.text || "(Non-text message)"}</p>
                {(message.mediaId || message.mediaUrl) && (
                  <img
                    className="message-image"
                    src={message.mediaUrl || getMessageMediaUrl(selected, message._id)}
                    alt={message.direction === "incoming" ? "Image received from customer" : "Image sent with this template"}
                    loading="lazy"
                  />
                )}
                <small>
                  {message.direction} · {message.status}
                  {" · "}
                  {new Date(message.timestamp).toLocaleString()}
                </small>
              </article>
            ))}

            {selected && !messages.length && (
              <p>No messages saved for this customer.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
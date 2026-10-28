import { useEffect, useState } from "react";
import {
  getCustomers,
  getConfigStatus,
  getMessages,
  importCSV,
  sendCampaign
} from "./api";
import "./index.css";

export default function App() {
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState([]);
  const [configStatus, setConfigStatus] = useState(null);
  const [file, setFile] = useState(null);
  const [template, setTemplate] = useState("");
  const [language, setLanguage] = useState("en_US");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setCustomers(await getCustomers());
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }

  async function openCustomer(phone) {
    setSelected(phone);

    try {
      setMessages(await getMessages(phone));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    refresh();
    getConfigStatus()
      .then(setConfigStatus)
      .catch(e => setError(e.message));
  }, []);

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
    setResult("Campaign processing...");

    try {
      const data = await sendCampaign(template.trim(), language);
      setResult(
        `Total: ${data.total} | Accepted: ${data.sent} | Failed: ${data.failed}`
      );

      if (selected) await openCustomer(selected);
    } catch (e) {
      setError(e.message);
      setResult("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>Trinetram Next-Gen PVT LTD</h1>
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
          customers. Only approved template name and language are needed here;
          API credentials are stored on the backend.
        </p>

        <form className="actions" onSubmit={handleCampaign}>
          <label className="form-field">
            <span>Approved template name</span>
            <input
              value={template}
              onChange={e => setTemplate(e.target.value)}
              placeholder="e.g. order_update"
              pattern="[a-z0-9_]+"
              title="Use the approved template name with lowercase letters, numbers, and underscores."
              required
            />
          </label>

          <label className="form-field">
            <span>Template language</span>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
            >
              <option value="en_US">English (US)</option>
              <option value="en_GB">English (UK)</option>
              <option value="hi">Hindi</option>
            </select>
          </label>

          <button disabled={busy || !template.trim()}>
            {busy ? "Please wait..." : "Send campaign"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>3. Customer inbox</h2>
          <span>{customers.length} customers</span>
        </div>

        <div className="inbox">
          <aside className="customer-list">
            {customers.map(customer => (
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
              <p>No customers yet. Import a CSV file first.</p>
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
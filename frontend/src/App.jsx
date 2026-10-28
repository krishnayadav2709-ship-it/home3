import { useEffect, useState } from "react";
import {
  getCustomers,
  getMessages,
  importCSV,
  sendCampaign
} from "./api";
import "./index.css";

export default function App() {
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState([]);
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
  }, []);

  async function handleImport(e) {
    e.preventDefault();
    if (!file || busy) return;

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

      {error && <div className="notice error">{error}</div>}
      {result && <div className="notice">{result}</div>}

      <section className="panel">
        <h2>1. Import customers</h2>
        <p>CSV columns: name, phone, optedIn</p>

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

        <form className="actions" onSubmit={handleCampaign}>
          <input
            value={template}
            onChange={e => setTemplate(e.target.value)}
            placeholder="Approved template name"
            required
          />

          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
          >
            <option value="en_US">English (US)</option>
            <option value="en_GB">English (UK)</option>
            <option value="hi">Hindi</option>
          </select>

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
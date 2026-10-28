# Deploying to Render

This repository includes a Render Blueprint at `render.yaml`. It creates:

- `whatsapp-bulk-backend`: a Node web service for the API and Meta webhook.
- `whatsapp-bulk-frontend`: a static site for the React dashboard.

## Deploy

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint**, connect the repository, and deploy the Blueprint.
3. When prompted, enter the backend's `MONGODB_URI`, `WHATSAPP_TOKEN`,
   `PHONE_NUMBER_ID`, `GRAPH_API_VERSION`, and the current rotated `APP_SECRET`.
   Do not commit these values or put them in the frontend.
4. Render generates `VERIFY_TOKEN` for the backend. After deployment, open the
   backend service's **Environment** page and copy its value for the Meta setup.
5. In MongoDB Atlas, allow connections from the backend service's outbound IP
   addresses. Keep database credentials private.

The Blueprint connects the frontend to the backend API and configures backend
CORS to allow the frontend's Render origin. `VITE_API_URL` is used at frontend
build time, so redeploy the static site after changing it.

## Configure the WhatsApp webhook

After the backend is live, use these values in the Meta app's WhatsApp Webhook
settings:

- **Callback URL:** `https://<whatsapp-bulk-backend Render URL>/webhook`
- **Verify token:** the backend's `VERIFY_TOKEN` value in Render
- **Client certificate:** leave disabled; this app does not use client
  certificates
- **Webhook field:** subscribe to `messages` to receive inbound messages and
  message status updates

Use the backend service URL shown by Render, including `https://`. Do not use
`localhost` in Meta's Callback URL. Select **Verify and save** after entering
the values.

## Local development

Keep local values in ignored `backend/.env` and `frontend/.env` files. The
backend listens on port `5000` by default. Set frontend `VITE_API_URL` to the
backend API base URL (for example, `http://localhost:5000/api`) and set
`CLIENT_URL` to the frontend origin (for example, `http://localhost:5173`).

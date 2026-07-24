const BASE = "/api";

function token() {
  return localStorage.getItem("dt_token");
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      Authorization: `Bearer ${token()}`,
      ...options.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("dt_token");
    window.location.href = "/app/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }

  return res.json();
}

export const api = {
  login: (username, password) =>
    fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).error || "Login failed");
      return r.json();
    }),

  stats:  () => request("/stats"),
  health: () => request("/health"),

  // Leads
  leads: () => request("/leads"),
  lead:  (id) => request(`/leads/${id}`),

  // Conversations
  conversations:       () => request("/conversations"),
  conversation:        (id) => request(`/conversations/${id}`),
  deleteConversation:  (id) => request(`/conversations/${id}`, { method: "DELETE" }),
  deleteAllConversations: () => request("/conversations", { method: "DELETE" }),

  // Properties
  properties:     () => request("/properties"),
  property:       (id) => request(`/properties/${id}`),
  createProperty: (data) => request("/properties", { method: "POST", body: JSON.stringify(data) }),
  updateProperty: (id, data) => request(`/properties/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProperty: (id) => request(`/properties/${id}`, { method: "DELETE" }),
  propertyImages: (id) => request(`/properties/${id}/images`),
  propertyVideos: (id) => request(`/properties/${id}/videos`),
  uploadImages: (id, files) => {
    const fd = new FormData();
    for (const f of files) fd.append("images", f);
    return request(`/properties/${id}/images`, { method: "POST", body: fd });
  },
  deleteImage: (imageId) => request(`/images/${imageId}`, { method: "DELETE" }),
  deleteVideo: (videoId) => request(`/videos/${videoId}`, { method: "DELETE" }),

  // Viewings — status values MUST be uppercase: CONFIRMED | CANCELLED | COMPLETED
  viewings:           () => request("/viewings"),
  deleteViewing:      (id) => request(`/viewings/${id}`, { method: "DELETE" }),
  deleteAllViewings:  () => request("/viewings", { method: "DELETE" }),
  updateViewingStatus: (id, status) =>
    request(`/viewings/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  notifyAgent: (id) =>
    request(`/viewings/${id}/notify-agent`, { method: "POST" }),

  // Broadcasts — drafts use { title, message } (not name)
  broadcastDrafts:  () => request("/broadcast/drafts"),
  broadcastDraft:   (id) => request(`/broadcast/drafts/${id}`),
  createDraft: (data) =>
    request("/broadcast/drafts", { method: "POST", body: JSON.stringify(data) }),
  updateDraft: (id, data) =>
    request(`/broadcast/drafts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDraft: (id) =>
    request(`/broadcast/drafts/${id}`, { method: "DELETE" }),
  broadcastResults: () => request("/broadcast/results"),
  broadcastStatus:  () => request("/broadcast/status"),
  // Send a broadcast to captured leads (message supports {name} personalisation)
  broadcastLeadsAudience: (tier) => request(`/broadcast/leads-audience${tier ? `?tier=${tier}` : ""}`),
  sendToLeads: (data) => request("/broadcast/send-leads", { method: "POST", body: JSON.stringify(data) }),

  // CRM
  crmStats: () => request("/crm/stats"),
  crmLog:   () => request("/crm/log"),
};

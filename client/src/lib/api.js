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

  // Stats
  stats: () => request("/stats"),
  health: () => request("/health"),

  // Leads
  leads: () => request("/leads"),
  lead: (id) => request(`/leads/${id}`),

  // Conversations
  conversations: () => request("/conversations"),
  conversation: (id) => request(`/conversations/${id}`),
  deleteConversation: (id) => request(`/conversations/${id}`, { method: "DELETE" }),
  deleteAllConversations: () => request("/conversations", { method: "DELETE" }),

  // Properties
  properties: () => request("/properties"),
  property: (id) => request(`/properties/${id}`),
  createProperty: (data) =>
    request("/properties", { method: "POST", body: JSON.stringify(data) }),
  updateProperty: (id, data) =>
    request(`/properties/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProperty: (id) => request(`/properties/${id}`, { method: "DELETE" }),
  propertyImages: (id) => request(`/properties/${id}/images`),
  propertyVideos: (id) => request(`/properties/${id}/videos`),
  uploadImages: (id, files) => {
    const fd = new FormData();
    for (const f of files) fd.append("images", f);
    return request(`/properties/${id}/images`, { method: "POST", body: fd });
  },
  uploadVideos: (id, files) => {
    const fd = new FormData();
    for (const f of files) fd.append("videos", f);
    return request(`/properties/${id}/videos`, { method: "POST", body: fd });
  },
  deleteImage: (imageId) => request(`/images/${imageId}`, { method: "DELETE" }),
  deleteVideo: (videoId) => request(`/videos/${videoId}`, { method: "DELETE" }),

  // Viewings
  viewings: () => request("/viewings"),
  viewing: (id) => request(`/viewings/${id}`),
  updateViewingStatus: (id, status) =>
    request(`/viewings/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
  deleteViewing: (id) => request(`/viewings/${id}`, { method: "DELETE" }),
  availableSlots: (date) => request(`/viewings/slots?date=${date}`),

  // Broadcasts
  broadcastDrafts: () => request("/broadcast/drafts"),
  broadcastDraft: (id) => request(`/broadcast/drafts/${id}`),
  createDraft: (data) =>
    request("/broadcast/drafts", { method: "POST", body: JSON.stringify(data) }),
  updateDraft: (id, data) =>
    request(`/broadcast/drafts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDraft: (id) => request(`/broadcast/drafts/${id}`, { method: "DELETE" }),
  broadcastResults: () => request("/broadcast/results"),
  sendBroadcast: (data) =>
    request("/broadcast/send", { method: "POST", body: JSON.stringify(data) }),

  // CRM
  crmStats: () => request("/crm/stats"),
  crmLog: () => request("/crm/log"),
};

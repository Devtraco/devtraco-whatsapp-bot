import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ImageIcon, ExternalLink, Grid3X3, List, X, Check, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { fmtCurrency, cn } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, CardBody, Modal, Input, Select, Textarea, PageLoader, Empty, ErrorBanner } from "@/components/ui";

const STATUS_COLORS = { "Now Selling": "green", "Coming Soon": "amber", "Sold Out": "red" };
const TYPES    = ["Apartments", "Hotel Apartments", "Townhouses", "Townhomes", "Land"];
const STATUSES = ["Now Selling", "Coming Soon", "Sold Out"];

const EMPTY_FORM = {
  name: "", location: "", type: "", category: "residential",
  bedrooms: "", priceFrom: "", currency: "USD",
  status: "Now Selling", projectUrl: "", amenities: "", description: "",
};

function toFormValues(p) {
  return {
    name:        p.name        || "",
    location:    p.location    || "",
    type:        p.type        || "",
    category:    p.category    || "residential",
    bedrooms:    Array.isArray(p.bedrooms) ? p.bedrooms.join(", ") : (p.bedrooms || ""),
    priceFrom:   p.priceFrom > 0 ? String(p.priceFrom) : "",
    currency:    p.currency    || "USD",
    status:      p.status      || "Now Selling",
    projectUrl:  p.projectUrl  || "",
    amenities:   Array.isArray(p.amenities) ? p.amenities.join(", ") : (p.amenities || ""),
    description: p.description || "",
  };
}

function PropertyForm({ initial, editId, onSave, onCancel, loading, error }) {
  const [form,   setForm]   = useState(initial || EMPTY_FORM);
  const [images, setImages] = useState([]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const isLand = form.type === "Land";

  function handleTypeChange(val) {
    set("type", val);
    if (val === "Land") set("category", "land_investment");
    else if (form.category === "land_investment") set("category", "residential");
  }

  function submit(e) {
    e.preventDefault();
    onSave({
      ...form,
      priceFrom: form.priceFrom !== "" ? Number(form.priceFrom) : 0,
      amenities: form.amenities ? form.amenities.split(",").map((a) => a.trim()).filter(Boolean) : [],
      bedrooms:  isLand ? [] : form.bedrooms,
    }, images, editId);
  }

  return (
    <form onSubmit={submit} className="px-6 py-5 space-y-4">
      <ErrorBanner message={error} />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Property Name *" value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="e.g. Arlo Cantonments" />
        <Input label="Location *"      value={form.location} onChange={(e) => set("location", e.target.value)} required placeholder="e.g. Cantonments, Accra" />
        <Select label="Type *" value={form.type} onChange={(e) => handleTypeChange(e.target.value)} required>
          <option value="">Select type…</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Select label="Category" value={form.category} onChange={(e) => set("category", e.target.value)}>
          <option value="residential">Residential</option>
          <option value="land_investment">Land Investment</option>
        </Select>
        {!isLand && (
          <Input label="Bedrooms" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)}
            placeholder="e.g. 0,1,2,3  (0 = studio)" />
        )}
        <Input
          label={isLand ? "Starting Price (0 = On Request)" : "Starting Price (USD) *"}
          type="number" min="0"
          value={form.priceFrom}
          onChange={(e) => set("priceFrom", e.target.value)}
          placeholder="e.g. 150000"
          required={!isLand}
        />
        <Select label="Currency" value={form.currency} onChange={(e) => set("currency", e.target.value)}>
          <option value="USD">USD — US Dollar</option>
          <option value="GHS">GHS — Ghanaian Cedi</option>
        </Select>
        <Select label="Status" value={form.status} onChange={(e) => set("status", e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <div className="col-span-2">
          <Input label="Project URL" type="url" value={form.projectUrl} onChange={(e) => set("projectUrl", e.target.value)} placeholder="https://…" />
        </div>
      </div>
      <Textarea label="Amenities (comma-separated)" value={form.amenities} onChange={(e) => set("amenities", e.target.value)}
        placeholder="Swimming Pool, Gym, 24/7 Security, Concierge" rows={2} />
      <Textarea label="Description" value={form.description} onChange={(e) => set("description", e.target.value)}
        placeholder="Brief property description for the AI chatbot…" rows={3} />
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-slate-600">Images (max 5 · up to 5 MB each)</label>
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-all"
          onClick={() => document.getElementById("pf-img-input").click()}>
          <Upload size={20} className="mx-auto text-slate-400 mb-2" />
          <p className="text-sm text-slate-500">
            {images.length > 0 ? `${images.length} file${images.length > 1 ? "s" : ""} selected` : "Click to upload images"}
          </p>
          <input id="pf-img-input" type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => setImages(Array.from(e.target.files).slice(0, 5))} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" loading={loading} icon={Check}>
          {editId ? "Update Property" : "Add Property"}
        </Button>
      </div>
    </form>
  );
}

function MediaManager({ propertyId, name, onClose }) {
  const qc = useQueryClient();
  const { data: imgData } = useQuery({ queryKey: ["propImages", propertyId], queryFn: () => api.propertyImages(propertyId) });

  async function deleteImg(id) {
    try { await api.deleteImage(id); qc.invalidateQueries({ queryKey: ["propImages", propertyId] }); }
    catch (e) { alert("Failed to delete: " + e.message); }
  }

  return (
    <Modal open onClose={onClose} title={`Media — ${name}`} width="max-w-xl">
      <div className="p-6">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Images</p>
        {!imgData?.images?.length ? (
          <p className="text-sm text-slate-400 text-center py-8">No images uploaded yet</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {imgData.images.map((img) => (
              <div key={img.imageId} className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-video">
                <img src={img.url} className="w-full h-full object-cover" alt="" />
                <button onClick={() => deleteImg(img.imageId)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-600 text-white rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex">
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function Properties() {
  const [view,      setView]      = useState("grid");
  const [formState, setFormState] = useState(null); // null | "add" | {property object}
  const [mediaId,   setMediaId]   = useState(null);
  const [formError, setFormError] = useState("");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["properties"], queryFn: api.properties });

  const saveMutation = useMutation({
    mutationFn: async ({ body, images, editId }) => {
      const prop = editId
        ? await api.updateProperty(editId, body)
        : await api.createProperty(body);
      const id = prop.propertyId || prop.id || editId;
      if (images?.length && id) await api.uploadImages(id, images);
      return prop;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["properties"] }); setFormState(null); setFormError(""); },
    onError:   (e) => setFormError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteProperty,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["properties"] }),
  });

  const properties = data?.properties || [];
  const mediaProperty = properties.find((p) => (p.propertyId || p.id) === mediaId);

  function openEdit(p) { setFormState(p); setFormError(""); }

  function handleSave(body, images, editId) {
    saveMutation.mutate({ body, images, editId });
  }

  if (isLoading) return <PageLoader />;

  const selling  = properties.filter((p) => p.status === "Now Selling").length;
  const soldOut  = properties.filter((p) => p.status === "Sold Out").length;
  const landCount = properties.filter((p) => p.category === "land_investment").length;

  return (
    <div className="space-y-5 max-w-[1400px]">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900">Property Portfolio</h2>
          <p className="text-sm text-slate-400">
            {properties.length} total · {selling} now selling · {soldOut} sold out · {landCount} land plots
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => setView("grid")} title="Grid view"
              className={cn("px-3 py-2 transition-colors", view === "grid" ? "bg-navy-900 text-white" : "text-slate-500 hover:bg-slate-50")}>
              <Grid3X3 size={15} />
            </button>
            <button onClick={() => setView("list")} title="List view"
              className={cn("px-3 py-2 transition-colors", view === "list" ? "bg-navy-900 text-white" : "text-slate-500 hover:bg-slate-50")}>
              <List size={15} />
            </button>
          </div>
          <Button icon={Plus} onClick={() => { setFormState("add"); setFormError(""); }}>Add Property</Button>
        </div>
      </div>

      {/* Form */}
      {formState !== null && (
        <Card>
          <CardHeader>
            <p className="font-semibold">
              {formState === "add" ? "Add New Property" : `Edit — ${formState.name}`}
            </p>
          </CardHeader>
          <PropertyForm
            initial={formState === "add" ? null : toFormValues(formState)}
            editId={formState === "add" ? null : (formState.propertyId || formState.id)}
            onSave={handleSave}
            onCancel={() => { setFormState(null); setFormError(""); }}
            loading={saveMutation.isPending}
            error={formError}
          />
        </Card>
      )}

      {/* Grid */}
      {view === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {properties.length === 0 ? (
            <div className="col-span-full">
              <Empty icon={Building2} title="No properties yet"
                description="Add your first property to populate the WhatsApp bot."
                action={<Button icon={Plus} onClick={() => setFormState("add")}>Add Property</Button>} />
            </div>
          ) : properties.map((p) => {
            const pid = p.propertyId || p.id;
            const img = p.images?.[0];
            return (
              <Card key={pid} className="overflow-hidden flex flex-col group hover:shadow-card-md transition-shadow">
                <div className="relative h-44 bg-slate-100 shrink-0">
                  {img
                    ? <img src={img} alt={p.name} className="w-full h-full object-cover" />
                    : <div className="flex items-center justify-center h-full"><ImageIcon size={36} className="text-slate-300" /></div>
                  }
                  <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
                    <Badge variant={STATUS_COLORS[p.status] || "default"}>{p.status}</Badge>
                    {p.category === "land_investment" && <Badge variant="amber">Land Plot</Badge>}
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col">
                  <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{p.location}</p>
                  <div className="flex items-center justify-between mt-2 mb-3">
                    <p className="text-sm font-bold text-brand-600">{fmtCurrency(p.priceFrom, p.currency)}</p>
                    <p className="text-xs text-slate-400">{p.type}</p>
                  </div>
                  {p.bedrooms?.length > 0 && (
                    <p className="text-xs text-slate-400 mb-3">
                      {p.bedrooms.includes(0)
                        ? `Studio${p.bedrooms.filter((b) => b > 0).length ? `, ${p.bedrooms.filter((b) => b > 0).join(", ")} bed` : ""}`
                        : `${p.bedrooms.join(", ")} bedroom`}
                    </p>
                  )}
                  <div className="flex gap-1.5 mt-auto">
                    <button onClick={() => openEdit(p)}
                      className="flex-1 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-1 transition-colors">
                      <Pencil size={11} /> Edit
                    </button>
                    <button onClick={() => setMediaId(pid)}
                      className="flex-1 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 flex items-center justify-center gap-1 transition-colors">
                      <ImageIcon size={11} /> Media
                    </button>
                    {p.projectUrl && (
                      <a href={p.projectUrl} target="_blank" rel="noopener noreferrer"
                        className="px-2 py-1.5 text-slate-400 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center transition-colors">
                        <ExternalLink size={11} />
                      </a>
                    )}
                    <button onClick={() => { if (confirm(`Delete "${p.name}"? This cannot be undone.`)) deleteMutation.mutate(pid); }}
                      className="px-2 py-1.5 text-red-400 border border-red-100 rounded-lg hover:bg-red-50 flex items-center transition-colors">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* List */}
      {view === "list" && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["Image", "Name", "Location", "Type", "Price", "Status", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {properties.map((p) => {
                  const pid = p.propertyId || p.id;
                  return (
                    <tr key={pid} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 w-16">
                        {p.images?.[0]
                          ? <img src={p.images[0]} className="w-12 h-8 object-cover rounded-lg border border-slate-200" alt="" />
                          : <div className="w-12 h-8 bg-slate-100 rounded-lg flex items-center justify-center"><ImageIcon size={14} className="text-slate-300" /></div>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{p.name}</p>
                        {p.category === "land_investment" && <Badge variant="amber" className="mt-1 text-[10px]">Land</Badge>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{p.location}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{p.type}</td>
                      <td className="px-4 py-3 font-semibold text-brand-600">{fmtCurrency(p.priceFrom, p.currency)}</td>
                      <td className="px-4 py-3"><Badge variant={STATUS_COLORS[p.status] || "default"}>{p.status}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(p)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="Edit"><Pencil size={13} /></button>
                          <button onClick={() => setMediaId(pid)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="Media"><ImageIcon size={13} /></button>
                          <button onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteMutation.mutate(pid); }} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Media manager */}
      {mediaId && mediaProperty && (
        <MediaManager propertyId={mediaId} name={mediaProperty.name} onClose={() => setMediaId(null)} />
      )}
    </div>
  );
}

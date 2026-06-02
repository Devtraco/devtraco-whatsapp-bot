import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Image, ExternalLink, Grid3X3, List, X, Check, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { fmtCurrency, cn } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, CardBody, Modal, Input, Select, Textarea, PageLoader, Empty, ErrorBanner } from "@/components/ui";

const STATUS_COLORS = { "Now Selling": "green", "Coming Soon": "amber", "Sold Out": "red" };
const TYPES = ["Apartments", "Hotel Apartments", "Townhouses", "Townhomes", "Land"];
const STATUSES = ["Now Selling", "Coming Soon", "Sold Out"];
const CATEGORIES = [{ value: "residential", label: "Residential" }, { value: "land_investment", label: "Land Investment" }];

const EMPTY_FORM = {
  name: "", location: "", type: "", category: "residential",
  bedrooms: "", priceFrom: "", currency: "USD", status: "Now Selling",
  projectUrl: "", amenities: "", description: "",
};

function PropertyForm({ initial, onSave, onCancel, loading, error }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [images, setImages] = useState([]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const isLand = form.type === "Land";

  function handleTypeChange(val) {
    set("type", val);
    if (val === "Land" && form.category === "residential") set("category", "land_investment");
    if (val !== "Land" && form.category === "land_investment") set("category", "residential");
  }

  function submit(e) {
    e.preventDefault();
    const data = {
      ...form,
      priceFrom: form.priceFrom !== "" ? Number(form.priceFrom) : 0,
      amenities: form.amenities ? form.amenities.split(",").map((a) => a.trim()).filter(Boolean) : [],
      bedrooms: isLand ? [] : form.bedrooms,
    };
    onSave(data, images);
  }

  return (
    <form onSubmit={submit} className="px-6 py-5 space-y-4">
      <ErrorBanner message={error} />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Property Name *" value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="e.g. Arlo Cantonments" />
        <Input label="Location *" value={form.location} onChange={(e) => set("location", e.target.value)} required placeholder="e.g. Cantonments, Accra" />
        <Select label="Type *" value={form.type} onChange={(e) => handleTypeChange(e.target.value)} required>
          <option value="">Select type…</option>
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </Select>
        <Select label="Category" value={form.category} onChange={(e) => set("category", e.target.value)}>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        {!isLand && (
          <Input label="Bedrooms" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)}
            placeholder="e.g. 0,1,2,3 or 1-3 (0 = studio)" />
        )}
        <Input label={`Starting Price ${isLand ? "(0 = On Request)" : "*"}`} type="number" min="0"
          value={form.priceFrom} onChange={(e) => set("priceFrom", e.target.value)}
          placeholder="e.g. 150000" required={!isLand} />
        <Select label="Currency" value={form.currency} onChange={(e) => set("currency", e.target.value)}>
          <option value="USD">USD — US Dollar</option>
          <option value="GHS">GHS — Ghanaian Cedi</option>
        </Select>
        <Select label="Status" value={form.status} onChange={(e) => set("status", e.target.value)}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Input label="Project URL" type="url" value={form.projectUrl} onChange={(e) => set("projectUrl", e.target.value)}
          placeholder="https://…" className="col-span-2" />
      </div>
      <Textarea label="Amenities (comma-separated)" value={form.amenities} onChange={(e) => set("amenities", e.target.value)}
        placeholder="Swimming Pool, Gym, 24/7 Security, Concierge" rows={2} />
      <Textarea label="Description" value={form.description} onChange={(e) => set("description", e.target.value)}
        placeholder="Brief property description…" rows={3} />
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-600">Images (max 5, up to 5MB each)</label>
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:border-brand-400 transition-colors"
          onClick={() => document.getElementById("prop-img-input").click()}>
          <Upload size={20} className="mx-auto text-slate-400 mb-2" />
          <p className="text-sm text-slate-500">{images.length > 0 ? `${images.length} file(s) selected` : "Click to upload images"}</p>
          <input id="prop-img-input" type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => setImages(Array.from(e.target.files).slice(0, 5))} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" loading={loading} icon={Check}>
          {initial?.propertyId ? "Update Property" : "Add Property"}
        </Button>
      </div>
    </form>
  );
}

function MediaModal({ propertyId, name, onClose }) {
  const { data: imgData } = useQuery({ queryKey: ["propImages", propertyId], queryFn: () => api.propertyImages(propertyId) });
  const { data: vidData } = useQuery({ queryKey: ["propVideos", propertyId], queryFn: () => api.propertyVideos(propertyId) });
  const qc = useQueryClient();

  async function deleteImg(id) {
    await api.deleteImage(id);
    qc.invalidateQueries(["propImages", propertyId]);
  }

  return (
    <Modal open onClose={onClose} title={`Media — ${name}`} width="max-w-2xl">
      <div className="p-6 space-y-5">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Images</p>
          {!imgData?.images?.length ? (
            <p className="text-sm text-slate-400 py-4 text-center">No images uploaded</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {imgData.images.map((img) => (
                <div key={img.imageId} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                  <img src={img.url} className="w-full h-full object-cover" alt="" />
                  <button
                    onClick={() => deleteImg(img.imageId)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  ><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default function Properties() {
  const [view, setView] = useState("grid");
  const [formState, setFormState] = useState(null); // null | "add" | property object
  const [mediaId, setMediaId] = useState(null);
  const [formError, setFormError] = useState("");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["properties"], queryFn: api.properties });

  const saveMutation = useMutation({
    mutationFn: async ({ data: body, images, editId }) => {
      const prop = editId
        ? await api.updateProperty(editId, body)
        : await api.createProperty(body);
      const id = prop.propertyId || prop.id || editId;
      if (images?.length && id) await api.uploadImages(id, images);
      return prop;
    },
    onSuccess: () => {
      qc.invalidateQueries(["properties"]);
      setFormState(null);
      setFormError("");
    },
    onError: (err) => setFormError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.deleteProperty(id),
    onSuccess: () => qc.invalidateQueries(["properties"]),
  });

  const properties = data?.properties || [];
  const mediaProperty = properties.find((p) => (p.propertyId || p.id) === mediaId);

  function handleSave(body, images) {
    const editId = typeof formState === "object" && formState !== null ? formState.propertyId || formState.id : null;
    saveMutation.mutate({ data: body, images, editId });
  }

  function openEdit(p) {
    setFormState({
      ...p,
      amenities: (p.amenities || []).join(", "),
      bedrooms: (p.bedrooms || []).join(", "),
      priceFrom: p.priceFrom > 0 ? p.priceFrom : "",
    });
    setFormError("");
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900">Property Portfolio</h2>
          <p className="text-sm text-slate-400">{properties.length} properties · {properties.filter((p) => p.status === "Now Selling").length} now selling</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => setView("grid")} className={cn("px-3 py-2 transition-colors", view === "grid" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50")}>
              <Grid3X3 size={15} />
            </button>
            <button onClick={() => setView("list")} className={cn("px-3 py-2 transition-colors", view === "list" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50")}>
              <List size={15} />
            </button>
          </div>
          <Button icon={Plus} onClick={() => { setFormState("add"); setFormError(""); }}>
            Add Property
          </Button>
        </div>
      </div>

      {/* Add/Edit form */}
      {formState !== null && (
        <Card>
          <CardHeader>
            <p className="font-semibold">{typeof formState === "object" ? `Edit — ${formState.name}` : "Add New Property"}</p>
          </CardHeader>
          <PropertyForm
            initial={typeof formState === "object" ? formState : null}
            onSave={handleSave}
            onCancel={() => { setFormState(null); setFormError(""); }}
            loading={saveMutation.isPending}
            error={formError}
          />
        </Card>
      )}

      {/* Grid view */}
      {view === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {properties.map((p) => {
            const pid = p.propertyId || p.id;
            const img = p.images?.[0];
            return (
              <Card key={pid} className="overflow-hidden group">
                {/* Image */}
                <div className="relative h-44 bg-slate-100">
                  {img ? (
                    <img src={img} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-300">
                      <Image size={40} />
                    </div>
                  )}
                  <div className="absolute top-2.5 left-2.5">
                    <Badge variant={STATUS_COLORS[p.status] || "default"}>{p.status}</Badge>
                  </div>
                  {p.category === "land_investment" && (
                    <div className="absolute top-2.5 right-2.5">
                      <Badge variant="amber">Land</Badge>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="p-4">
                  <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{p.location}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm font-bold text-brand-600">{fmtCurrency(p.priceFrom, p.currency)}</p>
                    <p className="text-xs text-slate-400">{p.type}</p>
                  </div>
                  {p.bedrooms?.length > 0 && (
                    <p className="text-xs text-slate-400 mt-1">
                      {p.bedrooms.includes(0) ? `Studio, ${p.bedrooms.filter((b) => b > 0).join(", ")} bed` : `${p.bedrooms.join(", ")} bed`}
                    </p>
                  )}
                </div>
                {/* Actions */}
                <div className="px-4 pb-4 flex gap-2">
                  <button onClick={() => openEdit(p)} className="flex-1 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center justify-center gap-1 transition-colors">
                    <Pencil size={12} /> Edit
                  </button>
                  <button onClick={() => setMediaId(pid)} className="flex-1 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 flex items-center justify-center gap-1 transition-colors">
                    <Image size={12} /> Media
                  </button>
                  {p.projectUrl && (
                    <a href={p.projectUrl} target="_blank" rel="noopener noreferrer"
                      className="px-2 py-1.5 text-slate-400 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center transition-colors">
                      <ExternalLink size={12} />
                    </a>
                  )}
                  <button onClick={() => { if (confirm(`Delete ${p.name}?`)) deleteMutation.mutate(pid); }}
                    className="px-2 py-1.5 text-red-400 border border-red-100 rounded-lg hover:bg-red-50 flex items-center transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </Card>
            );
          })}
          {properties.length === 0 && (
            <div className="col-span-full">
              <Empty icon={Building2} title="No properties yet" description="Add your first property to get started."
                action={<Button icon={Plus} onClick={() => setFormState("add")}>Add Property</Button>} />
            </div>
          )}
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-16">Image</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {properties.map((p) => {
                  const pid = p.propertyId || p.id;
                  return (
                    <tr key={pid} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        {p.images?.[0] ? (
                          <img src={p.images[0]} className="w-12 h-8 object-cover rounded-lg" alt="" />
                        ) : (
                          <div className="w-12 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                            <Image size={14} className="text-slate-300" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{p.name}</td>
                      <td className="px-4 py-3 text-slate-500">{p.location}</td>
                      <td className="px-4 py-3 text-slate-500">{p.type}</td>
                      <td className="px-4 py-3 font-semibold text-brand-600">{fmtCurrency(p.priceFrom, p.currency)}</td>
                      <td className="px-4 py-3"><Badge variant={STATUS_COLORS[p.status] || "default"}>{p.status}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(p)} className="p-1.5 text-slate-400 hover:text-brand-600 rounded-lg hover:bg-brand-50 transition-colors"><Pencil size={13} /></button>
                          <button onClick={() => setMediaId(pid)} className="p-1.5 text-slate-400 hover:text-brand-600 rounded-lg hover:bg-brand-50 transition-colors"><Image size={13} /></button>
                          <button onClick={() => { if (confirm(`Delete ${p.name}?`)) deleteMutation.mutate(pid); }} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={13} /></button>
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
        <MediaModal propertyId={mediaId} name={mediaProperty.name} onClose={() => setMediaId(null)} />
      )}
    </div>
  );
}

import mongoose from "mongoose";

// One row of the price sheet — a unit type within a property (Studio, 1 Bed, Penthouse, ...)
const priceUnitSchema = new mongoose.Schema({
  unitType:      { type: String, required: true },
  startPrice:    { type: Number, default: null },  // null when soldOut
  mortgagePrice: { type: Number, default: null },  // null when soldOut
  soldOut:       { type: Boolean, default: false },
}, { _id: false });

const propertySchema = new mongoose.Schema({
  propertyId: { type: String, required: true, unique: true, index: true },
  name:        { type: String, required: true },
  location:    { type: String, required: true },
  type:        { type: String, required: true },  // Apartments, Townhouses, Townhomes, Hotel Apartments, Land
  bedrooms:    [Number],          // e.g. [0, 1, 2, 3] — 0 = studio, [] = investment
  priceFrom:   { type: Number, required: true },
  currency:    { type: String, default: "USD" },
  amenities:   [String],
  status:      { type: String, default: "Now Selling" },
  category:    { type: String, default: "residential" },  // residential, land_investment, all_catalogue
  images:      [String],
  videos:      [String],
  projectUrl:  String,
  description: String,
  active:      { type: Boolean, default: true },  // soft-delete toggle

  // Per-unit-type pricing, kept in sync from the Devtraco price list Google Sheet.
  // priceFrom above is auto-derived from this list's cheapest available unit when present.
  priceList:       [priceUnitSchema],
  lastPriceSyncAt: { type: Date, default: null },
}, {
  timestamps: true,
});

export default mongoose.model("Property", propertySchema);

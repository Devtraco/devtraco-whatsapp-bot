import config from "../config/index.js";

/**
 * Property database — static for now, will be replaced by CRM/DB integration.
 */
const properties = [
  {
    id: "acacia",
    name: "The Acacia",
    location: "East Legon, Accra",
    type: "Luxury Apartments",
    bedrooms: [1, 2, 3],
    priceFrom: 120000,
    currency: "USD",
    amenities: ["Pool", "Gym", "24/7 Security", "Parking", "Landscaped Gardens"],
    status: "Ready for occupation",
    images: [
      "https://devtraco.com/images/acacia-1.jpg",
      "https://devtraco.com/images/acacia-2.jpg",
    ],
    virtualTourUrl: "https://devtraco.com/tours/acacia",
    description: "Modern luxury apartments in the heart of East Legon with premium finishes and resort-style amenities.",
  },
  {
    id: "one-elm",
    name: "One Elm",
    location: "Airport Residential, Accra",
    type: "Premium Apartments",
    bedrooms: [2, 3],
    priceFrom: 250000,
    currency: "USD",
    amenities: ["Rooftop Terrace", "Concierge", "Smart Home", "Parking"],
    status: "Under construction — Q3 2026 completion",
    images: [
      "https://devtraco.com/images/one-elm-1.jpg",
    ],
    virtualTourUrl: "https://devtraco.com/tours/one-elm",
    description: "Premium living in Accra's most prestigious neighborhood with cutting-edge smart home technology.",
  },
  {
    id: "palmview",
    name: "Palmview Estates",
    location: "Tema Community 25",
    type: "Townhouses",
    bedrooms: [3, 4],
    priceFrom: 180000,
    currency: "USD",
    amenities: ["Gated Community", "Playground", "Club House", "Jogging Track"],
    status: "Phase 2 now selling",
    images: [
      "https://devtraco.com/images/palmview-1.jpg",
    ],
    virtualTourUrl: "https://devtraco.com/tours/palmview",
    description: "Family-friendly townhouses in a serene gated community with excellent facilities.",
  },
  {
    id: "lancaster",
    name: "The Lancaster",
    location: "Ridge, Accra",
    type: "Office & Commercial Spaces",
    bedrooms: [],
    priceFrom: 350000,
    currency: "USD",
    amenities: ["Serviced Offices", "Conference Rooms", "Food Court", "Parking"],
    status: "Available",
    images: [
      "https://devtraco.com/images/lancaster-1.jpg",
    ],
    virtualTourUrl: null,
    description: "Grade A office and commercial spaces in Accra's central business district.",
  },
  {
    id: "villas",
    name: "Devtraco Villas",
    location: "East Legon Hills",
    type: "Detached Villas",
    bedrooms: [4, 5],
    priceFrom: 400000,
    currency: "USD",
    amenities: ["Private Garden", "Staff Quarters", "Home Automation", "Double Garage"],
    status: "8 units remaining",
    images: [
      "https://devtraco.com/images/villas-1.jpg",
    ],
    virtualTourUrl: "https://devtraco.com/tours/villas",
    description: "Exclusive detached villas with spacious layouts, private gardens, and smart home features.",
  },
];

/**
 * Search properties by criteria
 */
export function searchProperties({ location, type, minBudget, maxBudget, bedrooms } = {}) {
  return properties.filter((p) => {
    if (location && !p.location.toLowerCase().includes(location.toLowerCase())) return false;
    if (type && !p.type.toLowerCase().includes(type.toLowerCase())) return false;
    if (maxBudget && p.priceFrom > maxBudget) return false;
    if (minBudget && p.priceFrom < minBudget) return false;
    if (bedrooms && !p.bedrooms.includes(bedrooms)) return false;
    return true;
  });
}

/**
 * Get property by ID
 */
export function getPropertyById(id) {
  return properties.find((p) => p.id === id) || null;
}

/**
 * Get all properties
 */
export function getAllProperties() {
  return properties;
}

/**
 * Format property for WhatsApp message
 */
export function formatPropertyCard(property) {
  const beds = property.bedrooms.length
    ? `🛏️ ${property.bedrooms.join(", ")} bedroom`
    : "🏢 Commercial";

  return [
    `🏠 *${property.name}*`,
    `📍 ${property.location}`,
    `${beds}`,
    `💰 From $${property.priceFrom.toLocaleString()}`,
    `📋 ${property.status}`,
    ``,
    property.description,
    property.virtualTourUrl ? `\n🔗 Virtual Tour: ${property.virtualTourUrl}` : "",
  ].join("\n");
}

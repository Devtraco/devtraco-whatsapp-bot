import config from "../config/index.js";

/**
 * Property database — sourced from devtracoplus.com
 * Will be replaced by CRM/DB integration.
 */
const properties = [
  {
    id: "arlo-cantonments",
    name: "Arlo Cantonments",
    location: "Cantonments, Accra",
    type: "Apartments",
    bedrooms: [0, 1, 2, 3], // 0 = studio
    priceFrom: 83000,
    currency: "USD",
    amenities: [],
    status: "Now Selling",
    images: ["https://devtracoplus.com/site/assets/files/1409/arlo-image-975-x-620.jpg"],
    projectUrl: "https://arlo.devtracoplus.com",
    description: "Anchored in the prestigious and serene suburb of Cantonments, ARLO is a curated collection of residences ranging from studios to three-bedroom apartments.",
  },
  {
    id: "the-address",
    name: "The Address",
    location: "Roman Ridge, Accra",
    type: "Apartments",
    bedrooms: [0, 1, 2, 3], // includes penthouses
    priceFrom: 89000,
    currency: "USD",
    amenities: [],
    status: "Now Selling",
    images: ["https://devtracoplus.com/site/assets/files/1399/address.jpg"],
    projectUrl: "https://theaddress.devtracoplus.com",
    description: "A prestigious collection of luxury apartments in Roman Ridge. The Address comes in studio, 1, 2 & 3 bedroom apartments and Penthouses.",
  },
  {
    id: "the-edge",
    name: "The Edge",
    location: "Accra",
    type: "Apartments",
    bedrooms: [0, 1, 2, 3],
    priceFrom: 99000,
    currency: "USD",
    amenities: [],
    status: "Now Selling",
    images: [],
    projectUrl: "https://devtracoplus.com/projects/the-edge",
    description: "A mixed-use development designed to promote an urban quarters where people can live and enjoy life at the same time.",
  },
  {
    id: "nova",
    name: "NoVA",
    location: "Accra",
    type: "Apartments",
    bedrooms: [0, 1, 2, 3],
    priceFrom: 141347,
    currency: "USD",
    amenities: [],
    status: "Now Selling",
    images: [],
    projectUrl: "https://nova.devtracoplus.com",
    description: "A mixed-use ultra modern urban lifestyle development. NoVA comes in studios, 1, 2 and 3 bedroom apartments.",
  },
  {
    id: "acasia-apartments",
    name: "Acasia Apartments",
    location: "Accra",
    type: "Apartments",
    bedrooms: [1, 2, 3],
    priceFrom: 145000,
    currency: "USD",
    amenities: [],
    status: "Now Selling",
    images: [],
    projectUrl: "https://devtracoplus.com/projects/acasia-apartments",
    description: "An iconic symbol of luxury, quality and convenience for discerning homeowners in the heart of Accra.",
  },
  {
    id: "avant-garde",
    name: "Avant Garde",
    location: "Accra",
    type: "Apartments",
    bedrooms: [1, 2, 3],
    priceFrom: 170000,
    currency: "USD",
    amenities: [],
    status: "Now Selling",
    images: [],
    projectUrl: "https://devtracoplus.com/projects/the-avantgarde",
    description: "Designed to an exceptionally high standard, crafted to reflect residents' expectations of uncompromising quality and originality.",
  },
  {
    id: "henriettas-residences",
    name: "Henrietta's Residences",
    location: "Cantonments, Accra",
    type: "Apartments",
    bedrooms: [1, 2, 3],
    priceFrom: 245000,
    currency: "USD",
    amenities: [],
    status: "Now Selling",
    images: [],
    projectUrl: "https://devtracoplus.com/projects/henriettas-residences",
    description: "Located in Cantonments with brave design features and strategic proximity to notable landmarks.",
  },
  {
    id: "forte-residences",
    name: "Forte Residences",
    location: "Accra / Tema",
    type: "Townhouses",
    bedrooms: [2, 3, 4],
    priceFrom: 270720,
    currency: "USD",
    amenities: ["Gated Community"],
    status: "Now Selling",
    images: ["https://devtracoplus.com/site/assets/files/1336/about-forte.jpg"],
    projectUrl: "https://forte.devtracoplus.com",
    description: "Luxury living in a gated community. 2 to 4.5-bedroom townhouses that take residential living to the next level.",
  },
  {
    id: "the-pelican",
    name: "The Pelican Hotel Apartments",
    location: "Accra",
    type: "Hotel Apartments",
    bedrooms: [],
    priceFrom: 274125,
    currency: "USD",
    amenities: ["Hotel Investment", "Managed Returns"],
    status: "Now Selling",
    images: ["https://devtracoplus.com/site/assets/files/1347/pelican_ext_02_night_landscape.jpg"],
    projectUrl: "https://pelican.devtracoplus.com",
    description: "Invest in a hotel apartment in Accra. A proven and successful hotel investment model with managed returns.",
  },
  {
    id: "the-niiyo",
    name: "The Niiyo",
    location: "Dzorwulu, Accra",
    type: "Apartments",
    bedrooms: [1, 2, 3],
    priceFrom: 275000,
    currency: "USD",
    amenities: [],
    status: "Now Selling",
    images: [],
    projectUrl: "https://devtracoplus.com/projects/the-niiyo",
    description: "A residential oasis in Dzorwulu — the ultimate in simple and comfortable contemporary living.",
  },
  {
    id: "palmers-place",
    name: "Palmer's Place",
    location: "Accra",
    type: "Townhomes",
    bedrooms: [3, 4],
    priceFrom: 760000,
    currency: "USD",
    amenities: [],
    status: "Limited Availability",
    images: [],
    projectUrl: "https://devtracoplus.com/projects/palmers-place",
    description: "An exclusive development of seven modern townhomes with uncompromised, first class workmanship.",
  },
  {
    id: "acasia-townhomes",
    name: "Acasia Townhomes",
    location: "Accra",
    type: "Townhomes",
    bedrooms: [3, 4, 5],
    priceFrom: 850000,
    currency: "USD",
    amenities: [],
    status: "Limited Availability",
    images: [],
    projectUrl: "https://devtracoplus.com/projects/acasia",
    description: "An iconic symbol of luxury, quality and convenience for discerning homeowners in the heart of Accra.",
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
  let beds;
  if (property.bedrooms.length === 0) {
    beds = "🏨 Investment Property";
  } else if (property.bedrooms.includes(0)) {
    const others = property.bedrooms.filter(b => b > 0);
    beds = `🛏️ Studio${others.length ? `, ${others.join(", ")} bedroom` : ""}`;
  } else {
    beds = `🛏️ ${property.bedrooms.join(", ")} bedroom`;
  }

  return [
    `🏠 *${property.name}*`,
    `📍 ${property.location}`,
    `${beds}`,
    `💰 From $${property.priceFrom.toLocaleString()}`,
    `📋 ${property.status}`,
    ``,
    property.description,
    property.projectUrl ? `\n🔗 Learn more: ${property.projectUrl}` : "",
  ].join("\n");
}

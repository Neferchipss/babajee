// Where Indian cities and states sit on a map, for the analytics map: an
// order with a map pin uses the pin; the rest are placed by their city, or at
// the middle of their state when the city isn't listed here.
// [lat, lng], rounded; good enough for a country-wide picture.

const CITIES: Record<string, [number, number]> = {
  mumbai: [19.08, 72.88], thane: [19.22, 72.98], "navi mumbai": [19.03, 73.03], pune: [18.52, 73.86], nagpur: [21.15, 79.09], nashik: [20.0, 73.79],
  aurangabad: [19.88, 75.34], kolhapur: [16.7, 74.24], "new delhi": [28.61, 77.21], delhi: [28.65, 77.23], gurugram: [28.46, 77.03], noida: [28.54, 77.39],
  ghaziabad: [28.67, 77.45], faridabad: [28.41, 77.32], bengaluru: [12.97, 77.59], mysuru: [12.3, 76.64], mangaluru: [12.91, 74.86], hubballi: [15.36, 75.12],
  hyderabad: [17.39, 78.49], secunderabad: [17.44, 78.5], warangal: [17.97, 79.59], chennai: [13.08, 80.27], coimbatore: [11.02, 76.96], madurai: [9.93, 78.12],
  pondicherry: [11.94, 79.81], puducherry: [11.94, 79.81], kolkata: [22.57, 88.36], howrah: [22.59, 88.31], siliguri: [26.73, 88.4], darjeeling: [27.04, 88.26],
  panaji: [15.49, 73.83], margao: [15.27, 73.96], mapusa: [15.59, 73.81], vasco: [15.4, 73.81], calangute: [15.54, 73.76], ahmedabad: [23.02, 72.57],
  surat: [21.17, 72.83], vadodara: [22.31, 73.18], rajkot: [22.3, 70.8], gandhinagar: [23.22, 72.65], jaipur: [26.91, 75.79], udaipur: [24.59, 73.71],
  jodhpur: [26.24, 73.02], pushkar: [26.49, 74.55], chandigarh: [30.73, 76.78], mohali: [30.7, 76.72], panchkula: [30.69, 76.86], ludhiana: [30.9, 75.86],
  amritsar: [31.63, 74.87], kochi: [9.93, 76.27], thiruvananthapuram: [8.52, 76.94], kozhikode: [11.26, 75.78], varkala: [8.73, 76.72], indore: [22.72, 75.86],
  bhopal: [23.26, 77.41], gwalior: [26.22, 78.18], lucknow: [26.85, 80.95], kanpur: [26.45, 80.33], varanasi: [25.32, 82.97], agra: [27.18, 78.01],
  prayagraj: [25.44, 81.85], dehradun: [30.32, 78.03], rishikesh: [30.09, 78.27], haridwar: [29.95, 78.16], nainital: [29.38, 79.46], shimla: [31.1, 77.17],
  manali: [32.24, 77.19], dharamshala: [32.22, 76.32], kasol: [32.01, 77.31], shillong: [25.58, 91.89], guwahati: [26.14, 91.74], gangtok: [27.33, 88.61],
  imphal: [24.82, 93.94], aizawl: [23.73, 92.72], kohima: [25.67, 94.11], agartala: [23.83, 91.29], itanagar: [27.08, 93.61], patna: [25.59, 85.14],
  ranchi: [23.34, 85.31], jamshedpur: [22.8, 86.2], bhubaneswar: [20.3, 85.82], cuttack: [20.46, 85.88], raipur: [21.25, 81.63], visakhapatnam: [17.69, 83.22],
  vijayawada: [16.51, 80.65], tirupati: [13.63, 79.42], srinagar: [34.08, 74.8], jammu: [32.73, 74.86], leh: [34.15, 77.58], "port blair": [11.62, 92.73],
};

// other names people type for the same place
const ALIASES: Record<string, string> = {
  bombay: "mumbai", bangalore: "bengaluru", gurgaon: "gurugram", "new mumbai": "navi mumbai", calcutta: "kolkata", madras: "chennai", mysore: "mysuru",
  mangalore: "mangaluru", trivandrum: "thiruvananthapuram", cochin: "kochi", ernakulam: "kochi", calicut: "kozhikode", baroda: "vadodara", vizag: "visakhapatnam",
  allahabad: "prayagraj", banaras: "varanasi", benares: "varanasi", panjim: "panaji", madgaon: "margao", poona: "pune", "delhi ncr": "delhi", "greater noida": "noida",
};

const STATES: Record<string, [number, number]> = {
  "andhra pradesh": [15.9, 79.74], "arunachal pradesh": [28.22, 94.73], assam: [26.2, 92.94], bihar: [25.1, 85.31], chhattisgarh: [21.28, 81.87], goa: [15.3, 74.12],
  gujarat: [22.26, 71.19], haryana: [29.06, 76.09], "himachal pradesh": [31.1, 77.17], jharkhand: [23.61, 85.28], karnataka: [15.32, 75.71], kerala: [10.85, 76.27],
  "madhya pradesh": [22.97, 78.66], maharashtra: [19.75, 75.71], manipur: [24.66, 93.91], meghalaya: [25.47, 91.37], mizoram: [23.16, 92.94], nagaland: [26.16, 94.56],
  odisha: [20.95, 85.1], punjab: [31.15, 75.34], rajasthan: [27.02, 74.22], sikkim: [27.53, 88.51], "tamil nadu": [11.13, 78.66], telangana: [18.11, 79.02],
  tripura: [23.94, 91.99], "uttar pradesh": [26.85, 80.95], uttarakhand: [30.07, 79.02], "west bengal": [22.99, 87.85], delhi: [28.65, 77.23], chandigarh: [30.73, 76.78],
  "jammu and kashmir": [33.78, 76.58], ladakh: [34.15, 77.58], puducherry: [11.94, 79.81], "andaman and nicobar islands": [11.74, 92.66], lakshadweep: [10.57, 72.64],
  "dadra and nagar haveli and daman and diu": [20.4, 72.83],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

// [lat, lng] for a city, or its state's middle; null if neither is known
export function placeOf(city: string, state: string): { at: [number, number]; exact: boolean } | null {
  const c = norm(city);
  const hit = CITIES[ALIASES[c] ?? c];
  if (hit) return { at: hit, exact: true };
  const s = STATES[norm(state).replace(/^nct of /, "")];
  return s ? { at: s, exact: false } : null;
}

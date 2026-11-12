// A link to follow a parcel on the courier's own site. Most Indian couriers
// open a parcel's page straight from its tracking number; a few (DTDC, India
// Post, Shadowfax) only have a page to type it into, so the number is copied
// and pasted there. A courier we don't know gets a web search for its
// tracking, which usually lands on the right page.
export type TrackLink = { url: string; site: string; direct: boolean };

const COURIERS: { match: RegExp; site: string; url: (n: string) => string; direct?: false }[] = [
  { match: /delhivery/, site: "Delhivery", url: (n) => `https://www.delhivery.com/track-v2/package/${n}` },
  { match: /blue ?dart/, site: "Blue Dart", url: (n) => `https://www.bluedart.com/web/guest/trackdartresultthirdparty?trackFor=0&trackNo=${n}` },
  { match: /shiprocket/, site: "Shiprocket", url: (n) => `https://shiprocket.co/tracking/${n}` },
  { match: /xpress ?bees/, site: "Xpressbees", url: (n) => `https://www.xpressbees.com/shipment/tracking?awbNo=${n}` },
  { match: /ekart/, site: "Ekart", url: (n) => `https://ekartlogistics.com/shipmenttrack/${n}` },
  { match: /dtdc/, site: "DTDC", url: () => "https://www.dtdc.com/track-your-shipment/", direct: false },
  { match: /india ?post|speed ?post/, site: "India Post", url: () => "https://www.indiapost.gov.in/", direct: false },
  { match: /shadowfax/, site: "Shadowfax", url: () => "https://tracker.shadowfax.in/", direct: false },
];

export function trackLink(carrier: string | null | undefined, number: string | null | undefined): TrackLink | null {
  const n = (number ?? "").trim();
  if (!n) return null;
  const name = (carrier ?? "").trim();
  const known = COURIERS.find((c) => c.match.test(name.toLowerCase()));
  if (known) return { url: known.url(encodeURIComponent(n)), site: known.site, direct: known.direct !== false };
  return { url: `https://www.google.com/search?q=${encodeURIComponent(`${name || "courier"} tracking ${n}`)}`, site: name || "the courier", direct: true };
}

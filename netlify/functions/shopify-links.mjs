// Catches old Shopify cart and checkout links (the kind Instagram and Facebook
// product tags use, e.g. /cart/52286592057575:1 or /checkout?products=...)
// and sends the shopper to the matching product page on the new site.
// The numbers are Shopify variant and product IDs. Anything unknown goes to the shop.

const VARIANTS = {
  "52286592057575": "palo-santo-incense",
  "52286619320551": "palo-santo-7-andean-herbs-incense",
  "52286620958951": "palo-santo-eucalyptus-incense",
  "52286621188327": "palo-santo-rosemary-incense",
  "52286621450471": "palo-santo-wallpa-chaki-incense",
  "52286975934695": "palo-santo-aura-mist",
  "52286977540327": "palo-santo-bracelet-8mm",
  "52288068616423": "palo-santo-huayruro-bracelet",
  "52299849367783": "palo-santo-prayer-beads-8mm",
  "52299900715239": "palo-santo-chakana-necklace",
  "52299911004391": "palo-santo-bracelet-adjustable",
  "52515342024935": "love-notes-journal",
  "52528905257191": "inti-010-handmade-incense-holder",
  "52554198647015": "selenite-stick",
  "52608042959079": "mookaite-jasper-bracelet",
  "52633916834023": "inti-001",
  "52634044924135": "inti-003-chakana-incense-holder",
  "52634173538535": "inti-006-handmade-chakana-incense-holder",
  "52634352025831": "inti-005",
  "52634455081191": "inti-007",
  "52634483785959": "inti-008",
  "52634494632167": "inti-004",
  "52634524090599": "inti-009",
  "52634673905895": "inti-011",
  "52634743898343": "inti-013",
  "52757427683559": "inti-014",
  "52757490106599": "inti-016",
  "52757497970919": "inti-017",
  "52757595652327": "inti-018",
  "52762380566759": "inti-picture-jasper-resin-cross-bracelet",
  "52762393084135": "inti-picture-jasper-cream-resin-cross-bracelet",
  "52763351515367": "inti-amazonite-turquoise-resin-cross-bracelet",
  "52907925143783": "inti-001-hand-painted-shell",
  "52907989893351": "inti-002-hand-painted-shell",
  "52908187713767": "inti-003-hand-painted-shell",
  "52908201378023": "inti-004-hand-painted-shell",
  "52908253937895": "inti-005-hand-painted-shell",
  "53034090365159": "hand-shaped-clay-bowl-sunset",
};

const PRODUCTS = {
  "9623353196775": "palo-santo-incense",
  "9623359029479": "palo-santo-7-andean-herbs-incense",
  "9623359258855": "palo-santo-eucalyptus-incense",
  "9623359389927": "palo-santo-rosemary-incense",
  "9623359520999": "palo-santo-wallpa-chaki-incense",
  "9623417684199": "palo-santo-aura-mist",
  "9623418110183": "palo-santo-bracelet-8mm",
  "9623719117031": "palo-santo-huayruro-bracelet",
  "9628475752679": "palo-santo-prayer-beads-8mm",
  "9628498526439": "palo-santo-chakana-necklace",
  "9628502622439": "palo-santo-bracelet-adjustable",
  "9681346232551": "love-notes-journal",
  "9686030254311": "inti-010-handmade-incense-holder",
  "9691820818663": "selenite-stick",
  "9704586871015": "mookaite-jasper-bracelet",
  "9715587940583": "inti-001",
  "9715617595623": "inti-003-chakana-incense-holder",
  "9715666288871": "inti-006-handmade-chakana-incense-holder",
  "9715774554343": "inti-005",
  "9715830554855": "inti-007",
  "9715844219111": "inti-008",
  "9715850379495": "inti-004",
  "9715868467431": "inti-009",
  "9715952484583": "inti-011",
  "9715982958823": "inti-013",
  "10333708746983": "inti-014",
  "10333711237351": "inti-016",
  "10333711827175": "inti-017",
  "10333712810215": "inti-018",
  "10334702633191": "inti-picture-jasper-resin-cross-bracelet",
  "10334706073831": "inti-picture-jasper-cream-resin-cross-bracelet",
  "10334997381351": "inti-amazonite-turquoise-resin-cross-bracelet",
  "10368654409959": "inti-001-hand-painted-shell",
  "10368664207591": "inti-002-hand-painted-shell",
  "10368692093159": "inti-003-hand-painted-shell",
  "10368696975591": "inti-004-hand-painted-shell",
  "10368712179943": "inti-005-hand-painted-shell",
  "10403360899303": "hand-shaped-clay-bowl-sunset",
};

export default async (req) => {
  const url = new URL(req.url);
  // Every long number in the address or query string, in order.
  const ids = (decodeURIComponent(url.pathname + " " + url.search).match(/\d{10,}/g) || []);
  let handle = null;
  for (const id of ids) {
    handle = VARIANTS[id] || PRODUCTS[id];
    if (handle) break;
  }
  const to = handle ? `/products/${handle}/` : "/shop/";
  return new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store" } });
};

export const config = { path: ["/cart/*", "/checkout", "/checkout/*", "/checkouts/*", "/products/id/*"] };

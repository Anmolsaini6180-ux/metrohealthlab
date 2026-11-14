// The curated icon set offered by the admin category icon picker.
//
// These are NOT business data — they are ligature names from the
// "Material Icons" webfont that index.html already loads and that the
// whole app renders through the `.mi` class (see src/styles/global.css).
// A category document stores the plain ligature name, e.g. "bloodtype",
// exactly as the sidebar, bottom nav and empty states already do.
//
// Only names that exist in that font are listed here: an unknown
// ligature does not render as a blank — the font falls back to the
// literal text — which is why CategoryIcon also clips its box.

export type CategoryIconGroup =
  | "Diagnostics & lab"
  | "Health & body"
  | "Care & people"
  | "Booking & time"
  | "Location & logistics"
  | "Offers & payments"
  | "Reports & data"
  | "Trust & status"
  | "General";

// Shown as section headings in the picker, in this order.
export const CATEGORY_ICON_GROUPS: readonly CategoryIconGroup[] = [
  "Diagnostics & lab",
  "Health & body",
  "Care & people",
  "Booking & time",
  "Location & logistics",
  "Offers & payments",
  "Reports & data",
  "Trust & status",
  "General",
];

// Rendered whenever a category has no icon, or has one this app cannot
// make sense of. Matches the icon the admin sidebar already uses for
// the Categories screen.
export const FALLBACK_CATEGORY_ICON = "category";

// ligature name -> extra search terms. The name itself is always
// searchable, so the terms here are the synonyms an admin is likely to
// type instead: "heart", "covid", "kids", "offer", "tat"...
const ICON_KEYWORDS: Record<CategoryIconGroup, Record<string, string>> = {
  "Diagnostics & lab": {
    bloodtype: "blood group sample donation haematology cbc",
    biotech: "dna genetics molecule research microscope",
    science: "test tube lab experiment chemistry pathology",
    document_scanner: "xray x-ray scan radiology imaging film report",
    vaccines: "vaccine syringe injection immunisation shot needle",
    medication: "pill tablet capsule drug medicine",
    medication_liquid: "syrup bottle liquid medicine dose",
    medical_services: "doctor kit bag stethoscope consultation",
    local_hospital: "hospital clinic cross casualty",
    local_pharmacy: "pharmacy chemist drugstore",
    health_and_safety: "health safety shield care checkup",
    monitor_heart: "ecg heart rate cardiac pulse cardiology",
    healing: "bandage plaster wound recovery",
    thermostat: "temperature fever thermometer",
    water_drop: "water drop urine fluid hydration sample",
    masks: "mask face protection ppe",
    coronavirus: "covid virus infection pandemic",
    sanitizer: "sanitiser hygiene disinfect alcohol",
    clean_hands: "handwash hygiene wash",
    soap: "wash hygiene clean",
    sick: "illness unwell fever nausea symptom",
  },
  "Health & body": {
    favorite: "heart love cardiac wellness",
    favorite_border: "heart outline wellness like",
    psychology: "brain mental neurology mind therapy",
    hearing: "ear audiology sound hearing test",
    visibility: "eye vision ophthalmology sight",
    air: "lungs breathing respiratory oxygen pulmonology",
    monitor_weight: "weight scale obesity bmi",
    fitness_center: "gym fitness exercise strength",
    self_improvement: "yoga meditation wellness mindfulness",
    spa: "wellness relax therapy",
    restaurant: "diet nutrition food meal",
    local_drink: "hydration water drink fluid",
    bedtime: "sleep night rest insomnia",
    personal_injury: "injury bandage patient trauma orthopaedic",
    emergency: "urgent critical ambulance icu",
    accessibility_new: "body posture physiotherapy accessibility",
  },
  "Care & people": {
    person: "individual patient profile single",
    people: "patients group two multiple",
    groups: "community team family many",
    family_restroom: "family parents children household",
    pregnant_woman: "pregnancy maternity prenatal antenatal",
    child_care: "baby infant paediatric child newborn",
    escalator_warning: "parent child paediatric kids",
    elderly: "senior geriatric old age",
    female: "women woman gynaecology ladies",
    male: "men man andrology gents",
    volunteer_activism: "care donation support hand heart",
    support_agent: "helpdesk support call care",
    badge: "staff id card employee phlebotomist",
    how_to_reg: "registered verified enrolled signup",
  },
  "Booking & time": {
    calendar_month: "calendar month schedule booking",
    event: "appointment booking date",
    event_available: "slot available confirmed booking",
    schedule: "clock time appointment",
    access_time: "clock time duration",
    timer: "countdown turnaround tat duration",
    today: "date day",
    date_range: "period range dates",
    history: "past previous records earlier",
    alarm: "reminder alert time",
  },
  "Location & logistics": {
    location_on: "pin map address place area",
    pin_drop: "pin address map locality",
    home: "house home collection residence doorstep",
    home_work: "home office visit",
    apartment: "building flats residence society",
    business: "office corporate company",
    storefront: "shop centre branch store outlet",
    warehouse: "depot storage facility",
    local_shipping: "transport logistics delivery courier pickup",
    delivery_dining: "delivery rider doorstep",
    directions_car: "car travel drive",
    two_wheeler: "bike scooter rider",
    map: "map area coverage serviceable",
    near_me: "nearby location gps",
  },
  "Offers & payments": {
    local_offer: "offer tag deal discount promo",
    sell: "tag price sale deal",
    discount: "discount offer percent deal",
    percent: "percentage discount rate off",
    payments: "pay payment card money",
    account_balance_wallet: "wallet balance money",
    currency_rupee: "rupee inr price money cost",
    receipt: "bill invoice receipt",
    receipt_long: "invoice bill detailed statement",
    shopping_cart: "cart basket buy",
    shopping_bag: "bag purchase buy",
    local_mall: "mall shopping bag",
    card_giftcard: "gift voucher card reward",
    redeem: "redeem voucher gift reward coupon",
    savings: "savings piggy bank cost",
  },
  "Reports & data": {
    description: "document report file page",
    article: "article blog content news",
    assignment: "form checklist report clipboard",
    assignment_turned_in: "completed submitted done clipboard",
    fact_check: "verify check report review",
    summarize: "summary overview report",
    folder: "folder group collection files",
    book: "book guide manual",
    menu_book: "catalogue guide reading",
    note: "note memo remark",
    picture_as_pdf: "pdf download report file",
    analytics: "analytics stats chart insights",
    bar_chart: "bar chart graph statistics",
    pie_chart: "pie chart share breakdown",
    insights: "insights trends analytics",
    trending_up: "growth trend increase up",
    monitoring: "monitoring tracking metrics",
    query_stats: "statistics query analysis",
    dataset: "dataset data records table",
    speed: "speed fast performance quick express",
  },
  "Trust & status": {
    verified: "verified trusted certified tick",
    verified_user: "trusted secure user certified",
    shield: "protection shield secure",
    security: "security protection safe",
    lock: "secure private lock confidential",
    gpp_good: "protection good verified secure",
    check_circle: "done complete tick approved",
    task_alt: "done complete task tick",
    star: "star featured popular rating",
    star_border: "star outline rating",
    thumb_up: "like recommended approve",
    workspace_premium: "premium quality award certified nabl",
    military_tech: "award medal quality accreditation",
    new_releases: "new latest launch",
    info: "information details about",
    warning: "caution alert warning",
    error: "error problem alert",
    cancel: "cancel remove close",
    help: "help question support faq",
    priority_high: "urgent important priority",
  },
  General: {
    category: "category group classification default",
    label: "label tag classification",
    dashboard: "dashboard overview panel",
    apps: "apps grid modules",
    grid_view: "grid tiles layout",
    list: "list items rows",
    inventory: "inventory stock items",
    inventory_2: "package box kit bundle profile",
    tune: "settings adjust filters",
    filter_alt: "filter refine",
    sort: "sort order arrange",
    search: "search find lookup",
    bookmark: "bookmark saved favourite",
    campaign: "campaign announce marketing promotion",
    notifications: "alerts notifications bell",
    lightbulb: "idea tip awareness",
    bolt: "fast instant express quick",
    settings: "settings configuration gear",
    language: "language global website",
    phone: "call phone contact",
    email: "email mail contact",
    chat: "chat message support",
    wifi: "wifi online connectivity",
    cloud: "cloud online storage",
    image: "image picture photo",
    photo_library: "gallery photos library",
    camera_alt: "camera photo capture",
    qr_code: "qr code scan",
    share: "share send",
    open_in_new: "open external link",
  },
};

export interface CategoryIconOption {
  /** Ligature name, exactly as stored in Firestore (e.g. "bloodtype"). */
  name: string;
  /** Human-readable name for tooltips / screen readers. */
  label: string;
  group: CategoryIconGroup;
  /** Pre-joined haystack used by searchCategoryIcons(). */
  searchText: string;
}

function humanize(name: string): string {
  const words = name.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const CATEGORY_ICONS: readonly CategoryIconOption[] = CATEGORY_ICON_GROUPS.flatMap((group) =>
  Object.entries(ICON_KEYWORDS[group]).map(([name, keywords]) => ({
    name,
    label: humanize(name),
    group,
    searchText: `${name} ${name.replace(/_/g, " ")} ${keywords} ${group}`.toLowerCase(),
  }))
);

const CATEGORY_ICON_NAMES = new Set(CATEGORY_ICONS.map((icon) => icon.name));

// Ligature names are lowercase words joined by underscores. Anything
// else — a URL, an emoji, a class name from some other icon set, or the
// literal strings "undefined"/"null" that a bad legacy write can leave
// behind — is not renderable, and must fall back rather than be pasted
// into the page as text.
const ICON_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const NON_ICON_WORDS = new Set(["undefined", "null", "none", "nan", "false", "true"]);

/**
 * Best-effort cleanup of an icon value read from Firestore or typed by
 * a human. Returns `undefined` — never a broken name — when the value
 * cannot be rendered as a Material Icons ligature.
 */
export function normalizeIconName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!ICON_NAME_PATTERN.test(normalized)) return undefined;
  if (NON_ICON_WORDS.has(normalized)) return undefined;
  return normalized;
}

/** True when the value is one of the icons this picker offers. */
export function isKnownCategoryIcon(value: unknown): boolean {
  const name = normalizeIconName(value);
  return name !== undefined && CATEGORY_ICON_NAMES.has(name);
}

/**
 * Filters the catalog. Every whitespace-separated term must match, so
 * "blood sample" narrows rather than widens; an empty query returns the
 * whole list in catalog order.
 */
export function searchCategoryIcons(query: string): CategoryIconOption[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...CATEGORY_ICONS];
  return CATEGORY_ICONS.filter((icon) => terms.every((term) => icon.searchText.includes(term)));
}

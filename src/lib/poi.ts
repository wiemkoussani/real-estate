export const POI_FILTERS = [
  { id: "pharmacy", ar: "صيدلية", en: "Pharmacy", query: 'nwr["amenity"="pharmacy"]', search: "pharmacy" },
  { id: "restaurant", ar: "مطاعم", en: "Gastronomy", query: 'nwr["amenity"="restaurant"]\nnwr["amenity"="fast_food"]', search: "restaurant" },
  { id: "cafe", ar: "مقهى", en: "Cafe", query: 'nwr["amenity"="cafe"]', search: "cafe" },
  { id: "church", ar: "مسجد / كنيسة", en: "Church / Mosque", query: 'nwr["amenity"="place_of_worship"]', search: "mosque" },
  { id: "culture", ar: "ثقافة", en: "Culture", query: 'nwr["tourism"="museum"]\nnwr["amenity"="theatre"]\nnwr["amenity"="library"]', search: "museum" },
  { id: "parking", ar: "موقف سيارات", en: "Car Parking", query: 'nwr["amenity"="parking"]', search: "parking" },
  { id: "square", ar: "ساحة", en: "Square", query: 'nwr["leisure"="park"]\nnwr["place"="square"]', search: "park" },
  { id: "post", ar: "بريد", en: "Post Office", query: 'nwr["amenity"="post_office"]', search: "post office" },
  { id: "bus", ar: "موقف حافلة", en: "Bus Stop", query: 'nwr["highway"="bus_stop"]', search: "bus stop" },
  { id: "mall", ar: "مركز تسوق", en: "Shopping Mall", query: 'nwr["shop"="mall"]\nnwr["shop"="supermarket"]\nnwr["shop"="convenience"]', search: "supermarket" },
  { id: "school", ar: "مدرسة", en: "School", query: 'nwr["amenity"="school"]', search: "school" },
  { id: "bank", ar: "بنك", en: "Bank", query: 'nwr["amenity"="bank"]', search: "bank" },
] as const;

export type PoiKind = (typeof POI_FILTERS)[number]["id"];

export type PoiPlace = {
  id: string;
  kind: PoiKind;
  name: string;
  lat: number;
  lng: number;
};

export function kindOfTags(tags: Record<string, string> | undefined): PoiKind | null {
  if (!tags) return null;
  if (tags.amenity === "pharmacy") return "pharmacy";
  if (tags.amenity === "restaurant" || tags.amenity === "fast_food") return "restaurant";
  if (tags.amenity === "cafe") return "cafe";
  if (tags.amenity === "place_of_worship") return "church";
  if (tags.tourism === "museum" || tags.amenity === "theatre" || tags.amenity === "library") return "culture";
  if (tags.amenity === "parking") return "parking";
  if (tags.place === "square" || tags.leisure === "park") return "square";
  if (tags.amenity === "post_office") return "post";
  if (tags.highway === "bus_stop") return "bus";
  if (tags.shop === "mall" || tags.shop === "supermarket" || tags.shop === "convenience") return "mall";
  if (tags.amenity === "school") return "school";
  if (tags.amenity === "bank") return "bank";
  return null;
}

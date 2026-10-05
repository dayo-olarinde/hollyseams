/**
 * The measurement book's fields, defined once.
 *
 * The new-job wizard and the client dossier both render these — and they used to keep two
 * private copies of the list, which is how "Calf length" ends up in one screen and not the
 * other a month from now. One module, two derived shapes: `MEASUREMENT_FIELDS` for anything
 * that wants key + label, `MEASUREMENT_KEYS` for the record shape sent to the API.
 *
 * The order is the tailor's reading order (bust → waist → hip first), shared by both surfaces.
 */
const MEASUREMENT_FIELDS = [
  { key: "bust", name: "Bust" },
  { key: "waist", name: "Waist" },
  { key: "hip", name: "Hip" },
  { key: "chest", name: "Chest" },
  { key: "neck", name: "Neck" },
  { key: "shoulderToNipple", name: "Shoulder to Nipple" },
  { key: "nippleToNipple", name: "Nipple to Nipple" },
  { key: "roundUnderBust", name: "Round under Bust" },
  { key: "shoulderToUnderBust", name: "Shoulder to Under Bust" },
  { key: "acrossBack", name: "Across back" },
  { key: "roundShoulder", name: "Round Shoulder" },
  { key: "sleeve", name: "Sleeve" },
  { key: "longSleeve", name: "Long Sleeve" },
  { key: "shortSleeve", name: "Short Sleeve" },
  { key: "threeQuarterSleeve", name: "3/4 Sleeve" },
  { key: "bicep", name: "Bicep" },
  { key: "elbowRound", name: "Elbow round" },
  { key: "armhole", name: "Armhole" },
  { key: "wrist", name: "Wrist" },
  { key: "sideSlit", name: "Side Slit" },
  { key: "crotch", name: "Crotch" },
  { key: "thigh", name: "Thigh" },
  { key: "knee", name: "Knee" },
  { key: "kneeRound", name: "Knee round" },
  { key: "calfLength", name: "Calf length" },
  { key: "calfRound", name: "Calf round" },
  { key: "ankle", name: "Ankle" },
  { key: "kneeLength", name: "Knee length" },
  { key: "halfLength", name: "Half length" },
  { key: "skirtLength", name: "Skirt length" },
  { key: "dressLength", name: "Dress length" },
  { key: "fullLength", name: "Full length" },
  { key: "waistToHip", name: "Waist to Hip" },
  { key: "waistToKnee", name: "Waist to Knee" },
  { key: "length", name: "Length" },
] as const;

export const MEASUREMENT_KEYS: string[] = MEASUREMENT_FIELDS.map((f) => f.key);

/**
 * `shoulderToNipple` → "Shoulder to Nipple". Known fields get their curated label; a custom
 * measurement recorded by the wizard falls back to a spaced-out derivation, so the book never
 * prints raw camelCase.
 */
export const measureLabel = (key: string): string => {
  const field = MEASUREMENT_FIELDS.find((f) => f.key === key);
  if (field) return field.name;
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
};

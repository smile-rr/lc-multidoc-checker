// Helpers for extracting display value + confidence band from a FieldEnvelope.
// Backend FieldEnvelope shape: { value, confidence, manual, ... }

export function extractValue(v) {
  if (v == null) return null;
  if (typeof v === 'object' && 'value' in v) return v.value;
  return v;
}

export function extractConf(v) {
  if (v == null || typeof v !== 'object') return 'HIGH';
  const c = v.confidence;
  if (typeof c === 'string') return c.toUpperCase();
  if (typeof c === 'number') {
    if (c >= 0.95) return 'HIGH';
    if (c >= 0.75) return 'MED';
    return 'LOW';
  }
  return 'HIGH';
}

export interface StoreCandidate {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

export interface StoreLike extends StoreCandidate {
  id: string;
  deletedAt: string | null;
}

export function normalizePlaceText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function coordinatesAreValid(
  latitude: number | null,
  longitude: number | null,
): boolean {
  const latMissing = latitude === null;
  const lngMissing = longitude === null;
  if (latMissing !== lngMissing) {
    return false;
  }
  if (latitude === null || longitude === null) {
    return true;
  }
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const earth = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Same display name alone is not a duplicate.
 * A probable duplicate is a very close coordinate pair, or the same name and address
 * when coordinates are absent.
 */
export function findProbableDuplicate<T extends StoreLike>(
  stores: T[],
  candidate: StoreCandidate,
  ignoreId?: string,
): T | null {
  const name = normalizePlaceText(candidate.name);
  const address = normalizePlaceText(candidate.address);
  for (const store of stores) {
    if (store.deletedAt || store.id === ignoreId) {
      continue;
    }
    const bothHaveCoordinates =
      candidate.latitude !== null &&
      candidate.longitude !== null &&
      store.latitude !== null &&
      store.longitude !== null;
    if (bothHaveCoordinates) {
      const distance = haversineMeters(
        candidate.latitude as number,
        candidate.longitude as number,
        store.latitude as number,
        store.longitude as number,
      );
      if (distance < 30) {
        return store;
      }
      continue;
    }
    if (
      name.length > 0 &&
      name === normalizePlaceText(store.name) &&
      address.length > 0 &&
      address === normalizePlaceText(store.address)
    ) {
      return store;
    }
  }
  return null;
}

export type Point = { latitude: number; longitude: number };

export function destination(
  center: Point,
  distanceKm: number,
  bearing: number,
): Point {
  const lat = (center.latitude * Math.PI) / 180;
  const lng = (center.longitude * Math.PI) / 180;
  const d = distanceKm / 6371;
  const nextLat = Math.asin(
    Math.sin(lat) * Math.cos(d) +
      Math.cos(lat) * Math.sin(d) * Math.cos(bearing),
  );
  const nextLng =
    lng +
    Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat),
      Math.cos(d) - Math.sin(lat) * Math.sin(nextLat),
    );
  return {
    latitude: (nextLat * 180) / Math.PI,
    longitude: (((nextLng * 180) / Math.PI + 540) % 360) - 180,
  };
}

export function randomPoint(center: Point, radiusKm: number): Point {
  // Uniform area on the spherical cap, rather than clustering at the center.
  const angular = Math.acos(
    1 - Math.random() * (1 - Math.cos(radiusKm / 6371)),
  );
  return destination(center, angular * 6371, Math.random() * 2 * Math.PI);
}

export const NEXT_STATE: Record<string, string> = {
  published: 'offered',
  offered: 'accepted',
  accepted: 'en_route',
  en_route: 'arrived',
  arrived: 'confirmed',
  confirmed: 'completed',
};

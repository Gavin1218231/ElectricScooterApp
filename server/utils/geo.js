// Haversine formula for distance between two coordinates (in meters)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Generate a random point within a radius (in meters) of center
function randomPointInRadius(centerLat, centerLng, radiusMeters) {
  const radiusDeg = radiusMeters / 111320;
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * radiusDeg;

  return {
    latitude: centerLat + distance * Math.cos(angle),
    longitude: centerLng + distance * Math.sin(angle) / Math.cos(centerLat * Math.PI / 180),
  };
}

module.exports = { calculateDistance, randomPointInRadius };

const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('vim_token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('vim_token', token);
    } else {
      localStorage.removeItem('vim_token');
    }
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('Server returned an invalid response');
    }

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  // Auth
  register(email, password, name, phone) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, phone }),
    });
  }

  login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  getProfile() {
    return this.request('/auth/me');
  }

  updateProfile(data) {
    return this.request('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  topUp(amount) {
    return this.request('/auth/top-up', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  }

  // Scooters
  getScooters(lat, lng, radius) {
    const params = new URLSearchParams();
    if (lat != null) params.set('lat', lat);
    if (lng != null) params.set('lng', lng);
    if (radius != null) params.set('radius', radius);
    const qs = params.toString();
    return this.request(`/scooters${qs ? '?' + qs : ''}`);
  }

  getScooter(identifier) {
    return this.request(`/scooters/${identifier}`);
  }

  getAllScooters() {
    return this.request('/scooters/all');
  }

  // forceEnd=true also terminates an in-progress ride on this scooter.
  updateScooter(id, data, forceEnd = false) {
    return this.request(`/scooters/${id}${forceEnd ? '?force_end=true' : ''}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Rides
  startRide(scooterId, latitude, longitude) {
    return this.request('/rides/start', {
      method: 'POST',
      body: JSON.stringify({ scooter_id: scooterId, latitude, longitude }),
    });
  }

  updateRideLocation(rideId, latitude, longitude) {
    return this.request(`/rides/${rideId}/location`, {
      method: 'PUT',
      body: JSON.stringify({ latitude, longitude }),
    });
  }

  endRide(rideId, latitude, longitude) {
    return this.request(`/rides/${rideId}/end`, {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude }),
    });
  }

  rateRide(rideId, rating) {
    return this.request(`/rides/${rideId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    });
  }

  getRideHistory(page = 1) {
    return this.request(`/rides?page=${page}`);
  }

  getActiveRide() {
    return this.request('/rides/active');
  }

  // Payments
  getPayments() {
    return this.request('/payments');
  }

  // Admin
  getDashboard() {
    return this.request('/admin/dashboard');
  }

  addScooter(data) {
    return this.request('/admin/scooters', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  getAdminUsers() {
    return this.request('/admin/users');
  }

  getAdminRides() {
    return this.request('/admin/rides');
  }
}

const api = new ApiClient();
export default api;

// Konfigurasi URL Backend Kova
// Ganti URL ini dengan URL Render milikmu setelah di-deploy (misalnya: 'https://kova-backend.onrender.com')

const API_BASE_URL = 'http://localhost:3000'; // Default untuk testing lokal

// Interceptor Fetch API global untuk otomatis menambahkan API_BASE_URL dan kredensial cookie
const originalFetch = window.fetch;
window.fetch = function() {
  let [resource, config] = arguments;
  if (typeof resource === 'string' && resource.startsWith('/')) {
    resource = API_BASE_URL + resource;
  }
  config = config || {};
  // Pastikan cookies dikirim untuk autentikasi Cross-Origin
  config.credentials = 'include';
  return originalFetch(resource, config);
};

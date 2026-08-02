const BASE_URL = 'http://localhost:3001';
const email = 'demo-test@rakfort.com';
const password = 'governance.demo@Rakfort';

async function run() {
  // 1. Register (skips if user already exists)
  const registerRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Demo Test User', email, password, role: 'admin' })
  });
  console.log('Register:', registerRes.status, await registerRes.json().catch(() => registerRes.text()));

  // 2. Login
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const loginData = await loginRes.json();
  console.log('Login:', loginRes.status, loginData);

  if (!loginRes.ok) return;

  // 3. Use the token against a protected route
  const profileRes = await fetch(`${BASE_URL}/auth/profile`, {
    headers: { Authorization: `Bearer ${loginData.data.token}` }
  });
  console.log('Profile:', profileRes.status, await profileRes.json());
}

run();

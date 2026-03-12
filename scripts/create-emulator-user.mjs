const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';
const region = process.env.FIREBASE_FUNCTIONS_REGION || 'us-central1';
const baseUrl = process.env.FIREBASE_FUNCTIONS_BASE_URL || `http://127.0.0.1:55001/${projectId}/${region}`;

const payload = {
  email: process.env.TEST_USER_EMAIL || 'coach@makehaven.org',
  password: process.env.TEST_USER_PASSWORD || 'Password123!',
  first_name: process.env.TEST_USER_FIRST_NAME || 'Coach',
  last_name: process.env.TEST_USER_LAST_NAME || 'MakeHaven',
  system_role: process.env.TEST_USER_ROLE || 'platform_admin',
  organization_id: process.env.TEST_USER_ORG_ID || 'org_makehaven',
  ecosystem_id: process.env.TEST_USER_ECOSYSTEM_ID || 'eco_new_haven',
};

const response = await fetch(`${baseUrl}/createTestAccount`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const json = await response.json();
console.log(JSON.stringify(json, null, 2));
